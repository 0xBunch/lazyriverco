import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

// Per-user LLM usage tracking. One row per provider call — top-level
// generate*Response, each tool-loop iteration, vision pass, or Haiku
// helper. Task 2 lays down the wrappers; Task 3 retrofits the seven
// call sites in anthropic.ts / select-context.ts / ai-tagging.ts /
// the two admin routes.
//
// Design notes that are easy to miss:
//
//   1. recordUsage NEVER throws. A DB outage or missing ModelPricing
//      row must not break a user reply. Callers that await it are
//      still safe; callers that fire-and-forget get swallowed errors
//      via the internal try/catch.
//
//   2. Pricing is looked up fresh on every call — no in-memory cache.
//      Per the plan: Railway may run multiple instances and cross-
//      instance invalidation at N<=7 users isn't worth the complexity.
//      The @unique index on ModelPricing.model makes each lookup a
//      single indexed seek.
//
//   3. The Anthropic client is passed in (not imported from
//      @/lib/anthropic) so usage.ts stays dependency-free of the
//      provider modules. Task 3 will import FROM usage.ts; keeping
//      this direction one-way dodges a circular import.
//
//   4. requestMs is wall-clock from the TOP of the wrapper, not from
//      the SDK boundary. It's a cost-accounting field, not a UX
//      latency metric — first-token TTFB is measured elsewhere.

export const OPERATIONS = [
  "character.reply", // src/lib/anthropic.ts generateCharacterResponse
  "character.reply.stream", // src/lib/anthropic.ts streamCharacterResponse
  "context.select", // src/lib/select-context.ts Haiku call
  "media.analyze", // src/lib/ai-tagging.ts Gemini vision
  "admin.suggest_prompt", // src/app/api/admin/suggest-prompt/route.ts
  "admin.suggest_blurb", // src/app/api/admin/suggest-member-blurb/route.ts
] as const;

export type Operation = (typeof OPERATIONS)[number];

// ---------------------------------------------------------------------------
// Low-level writer

export type RecordUsageInput = {
  userId: string | null;
  provider: "anthropic" | "google";
  /** Full model ID, e.g. "claude-sonnet-4-6" or "gemini-2.5-flash". */
  model: string;
  operation: Operation;
  /** Stitch key for tool-loop iterations that share one user turn. */
  replyId?: string | null;
  iteration?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  imageCount?: number;
  conversationId?: string | null;
  messageId?: string | null;
  characterId?: string | null;
  mediaId?: string | null;
  requestMs?: number | null;
  success?: boolean;
  errorCode?: string | null;
};

/**
 * Insert one LLMUsageEvent row. NEVER throws — on any error, logs
 * and returns null so a tracking failure can't break a user reply.
 *
 * Returns the new event's id on success, null on failure.
 */
export async function recordUsage(
  input: RecordUsageInput,
): Promise<string | null> {
  try {
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    const cacheReadTokens = input.cacheReadTokens ?? 0;
    const cacheCreationTokens = input.cacheCreationTokens ?? 0;
    const imageCount = input.imageCount ?? 0;

    // Indexed lookup — @unique on ModelPricing.model. Sub-5ms at
    // phase-1 scale; no caching to keep multi-instance semantics
    // simple. Missing row → warn once, attribute cost = 0.
    const pricing = await prisma.modelPricing.findUnique({
      where: { model: input.model },
    });

    let estimatedCostUsd = 0;
    let pricingId: string | null = null;

    if (!pricing) {
      console.warn(
        `[usage] no ModelPricing row for model "${input.model}" — cost attributed as $0. Seed a row to fix.`,
      );
    } else {
      pricingId = pricing.id;
      const cacheWriteRate = pricing.cacheWritePerMTokUsd ?? 0;
      const cacheReadRate = pricing.cacheReadPerMTokUsd ?? 0;
      const perImage = pricing.perImageUsd ?? 0;
      estimatedCostUsd =
        (inputTokens * pricing.inputPerMTokUsd) / 1_000_000 +
        (outputTokens * pricing.outputPerMTokUsd) / 1_000_000 +
        (cacheReadTokens * cacheReadRate) / 1_000_000 +
        (cacheCreationTokens * cacheWriteRate) / 1_000_000 +
        imageCount * perImage;
    }

    const event = await prisma.lLMUsageEvent.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        replyId: input.replyId ?? null,
        iteration: input.iteration ?? 0,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        imageCount,
        estimatedCostUsd,
        pricingId,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
        characterId: input.characterId ?? null,
        mediaId: input.mediaId ?? null,
        requestMs: input.requestMs ?? null,
        success: input.success ?? true,
        errorCode: input.errorCode ?? null,
      },
      select: { id: true },
    });

    return event.id;
  } catch (err) {
    console.error("[usage] recordUsage failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Anthropic wrappers

export type TrackedCreateContext = {
  userId: string | null;
  operation: Operation;
  replyId?: string | null;
  iteration?: number;
  conversationId?: string | null;
  messageId?: string | null;
  characterId?: string | null;
  mediaId?: string | null;
};

/**
 * Wraps Anthropic's non-streaming messages.create with usage
 * recording. Records a success row on fulfillment, a failure row
 * with zero token counts on rejection, then re-throws the original
 * error so callers see the exact same rejection they always would.
 *
 * Accepts the client as a parameter to keep usage.ts free of any
 * import of @/lib/anthropic (prevents the circular dep Task 3 would
 * otherwise hit).
 */
export async function trackedMessagesCreate(
  client: Anthropic,
  ctx: TrackedCreateContext,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  // Derived from the SDK's own method signature (instead of naming
  // Anthropic.RequestOptions directly) so we stay attached to the
  // public surface. Lets callers forward an AbortSignal for real
  // HTTP-level request cancellation — see select-context.ts's 2s
  // Haiku budget, which uses this to actually abort the fetch rather
  // than just abandon it client-side.
  options?: Parameters<Anthropic["messages"]["create"]>[1],
): Promise<Anthropic.Messages.Message> {
  const started = Date.now();
  try {
    const response = await client.messages.create(params, options);
    // recordUsage never throws, but belt-and-suspenders: if something
    // in the promise chain ever changes, a stray rejection here would
    // silently bubble back to the caller as an unhandled reject.
    await recordUsage({
      userId: ctx.userId,
      provider: "anthropic",
      model: params.model,
      operation: ctx.operation,
      replyId: ctx.replyId ?? null,
      iteration: ctx.iteration ?? 0,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      conversationId: ctx.conversationId ?? null,
      messageId: ctx.messageId ?? null,
      characterId: ctx.characterId ?? null,
      mediaId: ctx.mediaId ?? null,
      requestMs: Date.now() - started,
      success: true,
    }).catch((e) => {
      console.error("[usage] trackedMessagesCreate record (success) failed:", e);
    });
    return response;
  } catch (err) {
    await recordUsage({
      userId: ctx.userId,
      provider: "anthropic",
      model: params.model,
      operation: ctx.operation,
      replyId: ctx.replyId ?? null,
      iteration: ctx.iteration ?? 0,
      inputTokens: 0,
      outputTokens: 0,
      conversationId: ctx.conversationId ?? null,
      messageId: ctx.messageId ?? null,
      characterId: ctx.characterId ?? null,
      mediaId: ctx.mediaId ?? null,
      requestMs: Date.now() - started,
      success: false,
      errorCode: err instanceof Error ? err.name : "unknown",
    }).catch((e) => {
      console.error("[usage] trackedMessagesCreate record (failure) failed:", e);
    });
    throw err;
  }
}

/**
 * Wraps Anthropic's streaming messages.stream. Returns the stream
 * SYNCHRONOUSLY so the caller can attach .on("text", ...) handlers
 * before tokens arrive — awaiting finalMessage() here would break
 * streaming semantics. Usage recording happens in the background
 * once the stream resolves; callers are decoupled from it.
 *
 * requestMs spans call start → finalMessage() resolution (end of
 * stream). It's a cost-accounting field, not TTFB.
 */
export function trackedMessagesStream(
  client: Anthropic,
  ctx: TrackedCreateContext,
  params: Anthropic.Messages.MessageStreamParams,
  // Forwarded verbatim to client.messages.stream — lets a caller
  // attach an AbortSignal for real request cancellation (e.g. user
  // hits "stop" on a streaming reply).
  options?: Parameters<Anthropic["messages"]["stream"]>[1],
): ReturnType<Anthropic["messages"]["stream"]> {
  const started = Date.now();
  // Anthropic.messages.stream returns a generic MessageStream<Parsed>.
  // We use ReturnType on the declared method (rather than importing
  // the MessageStream class directly from the SDK's /lib path) so the
  // type stays attached to the SDK's public surface.
  const stream = client.messages.stream(params, options);

  // Background recording — deliberately not awaited. .catch on the
  // outer chain so a recordUsage rejection (shouldn't happen, it's
  // internally guarded) never surfaces as an unhandled rejection.
  stream
    .finalMessage()
    .then((finalMsg) =>
      recordUsage({
        userId: ctx.userId,
        provider: "anthropic",
        model: params.model,
        operation: ctx.operation,
        replyId: ctx.replyId ?? null,
        iteration: ctx.iteration ?? 0,
        inputTokens: finalMsg.usage.input_tokens,
        outputTokens: finalMsg.usage.output_tokens,
        cacheReadTokens: finalMsg.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: finalMsg.usage.cache_creation_input_tokens ?? 0,
        conversationId: ctx.conversationId ?? null,
        messageId: ctx.messageId ?? null,
        characterId: ctx.characterId ?? null,
        mediaId: ctx.mediaId ?? null,
        requestMs: Date.now() - started,
        success: true,
      }),
    )
    .catch((err: unknown) =>
      recordUsage({
        userId: ctx.userId,
        provider: "anthropic",
        model: params.model,
        operation: ctx.operation,
        replyId: ctx.replyId ?? null,
        iteration: ctx.iteration ?? 0,
        inputTokens: 0,
        outputTokens: 0,
        conversationId: ctx.conversationId ?? null,
        messageId: ctx.messageId ?? null,
        characterId: ctx.characterId ?? null,
        mediaId: ctx.mediaId ?? null,
        requestMs: Date.now() - started,
        success: false,
        errorCode: err instanceof Error ? err.name : "unknown",
      }),
    )
    .catch((e: unknown) => {
      console.error("[usage] trackedMessagesStream record failed:", e);
    });

  return stream;
}

// ---------------------------------------------------------------------------
// Gemini wrapper

/**
 * Minimal shape of a Gemini generateContent response, just enough to
 * read the usage counters. Kept local so usage.ts doesn't import
 * @google/genai types (another boundary we don't need to cross).
 */
type GeminiUsageResponse = {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

export type TrackedGeminiContext = TrackedCreateContext & {
  /** Gemini model ID, e.g. "gemini-2.5-flash". */
  model: string;
  /** Number of images in the request. Gemini folds image tokens into
   *  promptTokenCount, so this is a product metric (not a cost
   *  multiplier — ModelPricing.perImageUsd is null for Gemini). */
  imageCount?: number;
};

/**
 * Wraps an arbitrary Gemini async thunk and records usage from the
 * returned response's usageMetadata. Mirrors trackedMessagesCreate's
 * success/failure semantics: record, then either return or re-throw
 * the original error.
 */
export async function trackedGeminiCall<T extends GeminiUsageResponse>(
  ctx: TrackedGeminiContext,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const response = await fn();
    await recordUsage({
      userId: ctx.userId,
      provider: "google",
      model: ctx.model,
      operation: ctx.operation,
      replyId: ctx.replyId ?? null,
      iteration: ctx.iteration ?? 0,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      // Gemini 2.5 Flash doesn't expose cache read/write counts the
      // same way Anthropic does — ignore for v1.
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      imageCount: ctx.imageCount ?? 0,
      conversationId: ctx.conversationId ?? null,
      messageId: ctx.messageId ?? null,
      characterId: ctx.characterId ?? null,
      mediaId: ctx.mediaId ?? null,
      requestMs: Date.now() - started,
      success: true,
    }).catch((e) => {
      console.error("[usage] trackedGeminiCall record (success) failed:", e);
    });
    return response;
  } catch (err) {
    await recordUsage({
      userId: ctx.userId,
      provider: "google",
      model: ctx.model,
      operation: ctx.operation,
      replyId: ctx.replyId ?? null,
      iteration: ctx.iteration ?? 0,
      inputTokens: 0,
      outputTokens: 0,
      imageCount: ctx.imageCount ?? 0,
      conversationId: ctx.conversationId ?? null,
      messageId: ctx.messageId ?? null,
      characterId: ctx.characterId ?? null,
      mediaId: ctx.mediaId ?? null,
      requestMs: Date.now() - started,
      success: false,
      errorCode: err instanceof Error ? err.name : "unknown",
    }).catch((e) => {
      console.error("[usage] trackedGeminiCall record (failure) failed:", e);
    });
    throw err;
  }
}
