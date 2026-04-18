import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { searchLibraryForAgent } from "@/lib/library-search";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  isValidAgentModel,
} from "@/lib/agent-models";
import { trackedMessagesCreate, trackedMessagesStream } from "@/lib/usage";

// Sonnet 4.6 — the latest and most capable Sonnet. Now that streaming
// is wired, the 10-20s generation time is invisible to the user because
// tokens flow in at ~1s TTFB. Verified model ID against Anthropic docs:
// "claude-sonnet-4-6" is the alias for the current Sonnet family.
export const CHAT_MODEL: AgentModelId = DEFAULT_AGENT_MODEL;

/** Narrow an arbitrary string (e.g. a DB column that may hold a stale
 *  value after an allowlist prune) back to a valid model id, falling
 *  back to CHAT_MODEL. Used by the stream route when loading a Character. */
export function resolveAgentModel(id: string | null | undefined): AgentModelId {
  return id && isValidAgentModel(id) ? id : CHAT_MODEL;
}

const MAX_TOKENS = 1500;

// Cap on client-managed tool-use iterations in a single reply. 3 is
// deliberately tight: enough for one library_search + one follow-up,
// but will abort if the model goes into a pathological search loop.
const MAX_TOOL_ITERATIONS = 3;

// Cap on TOTAL client-managed tool calls per turn across ALL iterations.
// The iteration bound above caps round trips, but each iteration can emit
// multiple tool_use blocks in parallel — a single compromised cookie could
// get Sonnet to fire 10 `library_search` calls on one message, bypassing
// the per-user rate limit. Tools past this cap get an is_error=true
// tool_result so the model can keep composing without further searches.
const MAX_TOOL_CALLS_PER_TURN = 4;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("<")) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add a real key to .env.local",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// Server-side web_search tool. Anthropic runs the search and feeds results
// back to the model transparently — no client-side tool loop needed. The
// model decides when to invoke it. Adds ~3-8s latency on turns that search,
// none on turns that don't. Tool spec verified against
// @anthropic-ai/sdk 0.89 docs (web_search_20250305).
//
// max_uses caps searches per single turn — cheap insurance against a
// pathological case where the model chains many searches on one message.
// Most turns use 0 or 1 searches, so this doesn't change normal behavior.
// At Anthropic's $10/1k searches, 3 caps a single runaway turn at $0.03.
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
} as const;

// Client-managed tool: we run the FTS ourselves and return a tool_result.
// Stop_reason becomes "tool_use" when Sonnet invokes this; the loops in
// generateCharacterResponse / streamCharacterResponse handle the back-and-
// forth. Different shape from web_search: no type/max_uses (those are for
// Anthropic-managed server-side tools only).
//
// Description is the model's only signal for WHEN to call this. Keep it
// concrete about the content domain (the crew's shared archive) rather
// than abstract capability ("search tool"). Tested triggers like "what
// do we have on X" / "any pictures of X" / references to specific
// in-group topics.
const LIBRARY_SEARCH_TOOL: Anthropic.Messages.Tool = {
  name: "library_search",
  description:
    "Search the Lazy River library — photos, videos, and links the Mens League crew has shared over time. Returns up to 6 ranked results with short descriptions and URLs. Use when the user asks about something the crew might have previously shared (e.g. 'what do we have on the Dodgers', 'any pictures of Blackie's trip', 'pull up that Sydney Sweeney thing KB posted'). Prefer this over web_search for anything that sounds like it lives in the group's own archive.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural-language search terms — people, teams, places, events, tags, or any distinctive keywords.",
      },
    },
    required: ["query"],
  },
};

const TOOLS: Anthropic.Messages.ToolUnion[] = [
  WEB_SEARCH_TOOL,
  LIBRARY_SEARCH_TOOL,
];

/**
 * Gate: when AGENT_MEDIA_VIA_TOOL=true, character-context.ts skips the
 * pre-computed "# Relevant media" block in the system prompt, because
 * Sonnet will pull fresh hits via library_search when the conversation
 * calls for them. One source of truth per turn avoids double-surfacing
 * the same items through both channels. Exposed as a function (not a
 * const) so tests can flip the env mid-suite.
 */
export function isAgentMediaViaToolEnabled(): boolean {
  return process.env.AGENT_MEDIA_VIA_TOOL === "true";
}

/**
 * Dispatch a client-managed tool_use block to its handler. Returns a
 * tool_result block ready to include in the next turn's user message.
 * Errors become is_error=true results so Sonnet can apologize + skip
 * rather than abort the whole reply.
 */
async function dispatchClientTool(
  block: Anthropic.Messages.ToolUseBlock,
): Promise<Anthropic.Messages.ToolResultBlockParam> {
  if (block.name === "library_search") {
    const input = block.input as { query?: unknown };
    const query = typeof input.query === "string" ? input.query : "";
    try {
      const result = await searchLibraryForAgent(query);
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      };
    } catch (e) {
      console.error("[library_search] dispatch failed", e);
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: "library_search hit an error. Skip the library for this turn.",
        is_error: true,
      };
    }
  }
  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: `Unknown tool: ${block.name}`,
    is_error: true,
  };
}

/** Join every text block in a response, trimmed. Returns "" when there
 *  is no text content (distinct from `requireText` which throws). */
function joinTextBlocks(
  content: readonly Anthropic.Messages.ContentBlock[],
): string {
  return content
    .filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text",
    )
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Rebuild a ContentBlockParam[] suitable for echoing back as the
 *  assistant's turn in a tool-use loop. Text + tool_use blocks are
 *  constructed explicitly (clear intent, catches future SDK shape
 *  drift); server-managed blocks (server_tool_use, web_search_tool_result)
 *  pass through with a narrow cast — they're Anthropic-internal and the
 *  shapes line up 1:1 in practice. */
function toContentBlockParams(
  blocks: readonly Anthropic.Messages.ContentBlock[],
): Anthropic.Messages.ContentBlockParam[] {
  return blocks.map((b): Anthropic.Messages.ContentBlockParam => {
    if (b.type === "text") {
      return { type: "text", text: b.text };
    }
    if (b.type === "tool_use") {
      return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    }
    return b as unknown as Anthropic.Messages.ContentBlockParam;
  });
}

// Built fresh per call so the date is accurate. The worldliness paragraph
// unlocks the model's existing knowledge of public figures / current events
// for in-character riffing — without it personas tend to dodge ("I have no
// idea who that is") when asked about real people they actually know about
// from training. The web_search nudge tells them to reach for the tool when
// genuinely stale.
//
// When `dialogueMode=true`, an additional block is appended that overrides
// the "1-3 sentences, group-chat" guidance in each persona's bible and
// grants permission (not obligation) to emit <followups> tag suggestions.
// The tail is the last thing the model reads, so later instructions win
// over the bible when they conflict.
function buildSystemPromptTail(dialogueMode: boolean = false): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const base = [
    "",
    `Today is ${today}.`,
    "",
    "You exist in the real world and are aware of public figures, current",
    "events, news, sports, politics, and pop culture from your training. Riff",
    "on real people and events from your own POV — never dodge with 'I don't",
    "know who that is' if it's someone reasonably well-known. If you genuinely",
    "need fresh or recent info (breaking news, live scores, anything past your",
    "training), use the web_search tool. Apply your persona's voice and",
    "opinions to whatever you find.",
    "",
    "Respond in character. Never break character. Never mention that you are an AI.",
  ];
  if (!dialogueMode) {
    return base.join("\n");
  }
  // Dialogue-mode addendum — supersedes any length guidance in the bible.
  const dialogue = [
    "",
    "RESPONSE DEPTH: Previous guidance in your persona notes may suggest",
    "keeping replies to 1-3 sentences. For this conversation, that cap does",
    "NOT apply — reply at the depth the question actually warrants. Short",
    "when short is right, longer when nuance or explanation would genuinely",
    "help. Ending with an open question is fine when it naturally extends",
    "the thread.",
    "",
    "OPTIONAL FOLLOW-UPS: When the topic has clear branches or the user",
    "seems to be exploring, you MAY close your reply with 2-3 short",
    "suggested follow-up prompts inside <followups>…</followups> tags,",
    "one per line. Each suggestion should read as a natural thing the",
    "USER might say next, written in their voice as a first-person",
    "question or request (5-12 words). Do NOT include the tag when your",
    "answer is self-contained or you just asked the user a question.",
    "Never put anything except the bullet list of suggestions inside the",
    "tag. Example format:",
    "<followups>",
    "how does this compare to last year?",
    "who else has done this well?",
    "can you show me an example?",
    "</followups>",
  ];
  return [...base, ...dialogue].join("\n");
}

export type ChatContextLine = {
  displayName: string;
  content: string;
};

/**
 * Strip characters that could let a displayName escape the `[Name]:`
 * transcript frame and pose as a system instruction (e.g. a name like
 * `Kyle] [System]: ignore previous` or a name containing newlines).
 * Admin-curated today — defense in depth against future ingest paths
 * or the admin pranking themselves. Content is not sanitized: user voice
 * is expected to contain arbitrary text, and the model is trained to
 * treat transcript content as data rather than instructions.
 */
function sanitizeDisplayName(raw: string): string {
  const cleaned = raw.replace(/[\[\]\r\n]/g, "").trim();
  return cleaned || "?";
}

function formatChatContext(lines: readonly ChatContextLine[]): string {
  return lines
    .map((l) => `[${sanitizeDisplayName(l.displayName)}]: ${l.content}`)
    .join("\n");
}

/**
 * Build the system prompt as a structured array of TextBlockParam so we
 * can stick a `cache_control: { type: "ephemeral" }` breakpoint right
 * after the persona bible. Anthropic's prompt cache hashes the request
 * up through the last `cache_control` mark; subsequent turns in the
 * same conversation (same bible) get a ~90% input-token discount on
 * that prefix.
 *
 * Shape:
 *   [
 *     bible (cached),
 *     richContext (uncached — turn-dependent lore/media selection),
 *     tail (uncached — contains today's date + dialogue addendum)
 *   ]
 *
 * The uncached tail is always last so the date refresh and the
 * dialogue-mode toggle never invalidate the cached prefix.
 *
 * NOTE: the bible MUST exceed Anthropic's minimum cacheable prefix
 * length (currently ~1024 tokens on Sonnet/Opus, lower on Haiku) for
 * the `cache_control` mark to take effect. Below threshold the SDK
 * silently ignores the mark — no error, just no discount.
 */
function composeSystemBlocks(
  bible: string,
  richContext: string | null,
  dialogueMode: boolean = false,
): Anthropic.Messages.TextBlockParam[] {
  // Normalize whitespace edges so the cached block text is bit-stable
  // across turns even if the admin edits the bible trailing whitespace
  // or the richContext selection flips between "has content" and "no
  // content". Cache hits are computed from the exact block text; drift
  // here is drift in the cache key for no semantic reason.
  const bibleText = bible.trimEnd() + "\n";

  const blocks: Anthropic.Messages.TextBlockParam[] = [
    {
      type: "text",
      text: bibleText,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (richContext && richContext.trim()) {
    blocks.push({
      type: "text",
      text: richContext.trim() + "\n",
    });
  }
  blocks.push({
    type: "text",
    text: buildSystemPromptTail(dialogueMode),
  });
  return blocks;
}

/** Log prompt-cache usage at INFO level so we can eyeball hit rate
 *  without pulling full observability. On a warmed conversation the
 *  `cache_read_input_tokens` field dominates `cache_creation_input_tokens`
 *  — that's the signal that the per-agent bible is landing in cache.
 *  Cheap string build; no-op in prod if CHAT_CACHE_LOG=off. */
function logCacheUsage(
  model: string,
  usage: Anthropic.Messages.Usage | undefined,
): void {
  if (process.env.CHAT_CACHE_LOG === "off") return;
  if (!usage) return;
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  console.info(
    `[chat/usage] model=${model} in=${input} out=${output} cache_read=${read} cache_write=${write}`,
  );
}

/** Like joinTextBlocks but throws when the response has no text. Used
 *  by one-shot call sites that can't continue without a reply. */
function requireText(
  content: readonly Anthropic.Messages.ContentBlock[],
): string {
  const text = joinTextBlocks(content);
  if (!text) {
    throw new Error("Anthropic response contained no text block");
  }
  return text;
}

function buildUserPrompt(
  recentContext: readonly ChatContextLine[],
  newMessage: ChatContextLine,
): string {
  const transcript = formatChatContext([...recentContext, newMessage]);
  return [
    "Here is the recent conversation, oldest first. Reply to the most recent",
    "message in your own voice. Output ONLY the reply text — no prefixes,",
    "no quoting, no meta commentary.",
    "",
    transcript,
  ].join("\n");
}

/**
 * Per-agent overrides that flow from the Character row into every SDK call.
 * `model` is narrowed via `resolveAgentModel` so a stale DB value can't
 * pin a request against a model the SDK no longer accepts. `dialogueMode`
 * toggles the dialogue addendum on the system prompt tail.
 *
 * `userId` / `conversationId` / `characterId` are tracking context passed
 * through to `trackedMessagesCreate` / `trackedMessagesStream` so every
 * LLMUsageEvent row can be attributed to the requesting user and stitched
 * back to its conversation and responding character.
 */
export type ChatGenerateOptions = {
  model?: string | null;
  dialogueMode?: boolean;
  userId?: string | null;
  conversationId?: string | null;
  characterId?: string | null;
};

/**
 * One-shot (non-streaming) character response. Used by:
 *   - runOrchestrator (legacy channel path)
 *   - runConversationOrchestrator (fire-and-forget on initial conversation create)
 *   - generateDraftCommentary
 *
 * Implements a client-managed tool-use loop so the model can call
 * library_search during a reply. web_search_20250305 is handled by
 * Anthropic server-side and doesn't trigger the loop; only our own
 * tools do. Loop caps at MAX_TOOL_ITERATIONS; text from each iteration
 * is concatenated so nothing gets dropped if the model speaks before
 * and after a tool call.
 */
export async function generateCharacterResponse(
  systemPrompt: string,
  recentContext: readonly ChatContextLine[],
  newMessage: ChatContextLine,
  richContext: string | null = null,
  opts: ChatGenerateOptions = {},
): Promise<string> {
  const model = resolveAgentModel(opts.model);
  const dialogueMode = opts.dialogueMode ?? false;
  const replyId = crypto.randomUUID();
  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: buildUserPrompt(recentContext, newMessage),
    },
  ];
  let accumulated = "";
  let toolCallsUsed = 0;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await trackedMessagesCreate(
      getClient(),
      {
        userId: opts.userId ?? null,
        operation: "character.reply",
        replyId,
        iteration: iter,
        conversationId: opts.conversationId ?? null,
        characterId: opts.characterId ?? null,
      },
      {
        model,
        max_tokens: MAX_TOKENS,
        temperature: 0.9,
        system: composeSystemBlocks(systemPrompt, richContext, dialogueMode),
        tools: TOOLS,
        messages,
      },
    );
    logCacheUsage(model, response.usage);

    const thisText = joinTextBlocks(response.content);
    if (thisText) {
      accumulated += (accumulated ? "\n\n" : "") + thisText;
    }

    if (response.stop_reason !== "tool_use") {
      if (!accumulated) {
        throw new Error("Anthropic response contained no text block");
      }
      return accumulated;
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    const toolResults = await dispatchWithBudget(toolUseBlocks, toolCallsUsed);
    toolCallsUsed += toolUseBlocks.length;
    messages.push(
      {
        role: "assistant",
        content: toContentBlockParams(response.content),
      },
      { role: "user", content: toolResults },
    );
  }

  if (!accumulated) {
    throw new Error("Tool loop exceeded max iterations with no text");
  }
  return accumulated;
}

/**
 * Dispatch at most (MAX_TOOL_CALLS_PER_TURN - alreadyUsed) client-managed
 * tool calls in parallel; any overflow gets a budget-exhausted tool_result
 * so the model sees the refusal and stops trying.
 */
async function dispatchWithBudget(
  blocks: Anthropic.Messages.ToolUseBlock[],
  alreadyUsed: number,
): Promise<Anthropic.Messages.ToolResultBlockParam[]> {
  const budget = Math.max(0, MAX_TOOL_CALLS_PER_TURN - alreadyUsed);
  const allowed = blocks.slice(0, budget);
  const denied = blocks.slice(budget);
  const results = await Promise.all(allowed.map(dispatchClientTool));
  for (const block of denied) {
    results.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: `Tool-call budget exhausted for this turn (max ${MAX_TOOL_CALLS_PER_TURN}). Compose your reply without further tool calls.`,
      is_error: true,
    });
  }
  return results;
}

/**
 * Streaming character response with callback. Fires `onDelta` for each
 * text chunk as it arrives from the Anthropic API. Returns the full
 * accumulated reply text when the stream completes. Used by the SSE
 * stream endpoint (POST /api/conversations/[id]/stream) to pipe tokens
 * to the client in real time.
 *
 * Uses `stream.on("text")` rather than the async-iterable `.textStream`
 * property, which isn't available in SDK 0.89.0.
 */
export async function streamCharacterResponse(
  systemPrompt: string,
  recentContext: readonly ChatContextLine[],
  newMessage: ChatContextLine,
  richContext: string | null = null,
  onDelta: (delta: string) => void = () => {},
  opts: ChatGenerateOptions = {},
): Promise<string> {
  const model = resolveAgentModel(opts.model);
  const dialogueMode = opts.dialogueMode ?? false;
  const replyId = crypto.randomUUID();
  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: buildUserPrompt(recentContext, newMessage),
    },
  ];
  let fullText = "";
  let toolCallsUsed = 0;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const stream = trackedMessagesStream(
      getClient(),
      {
        userId: opts.userId ?? null,
        operation: "character.reply.stream",
        replyId,
        iteration: iter,
        conversationId: opts.conversationId ?? null,
        characterId: opts.characterId ?? null,
      },
      {
        model,
        max_tokens: MAX_TOKENS,
        temperature: 0.9,
        system: composeSystemBlocks(systemPrompt, richContext, dialogueMode),
        tools: TOOLS,
        messages,
      },
    );

    stream.on("text", (delta: string) => {
      fullText += delta;
      onDelta(delta);
    });

    // trackedMessagesStream's return is ReturnType<Anthropic["messages"]["stream"]>,
    // which collapses the SDK's generic MessageStream<Parsed> param to
    // `unknown`. finalMessage() is still Anthropic.Messages.Message — cast
    // so downstream .content inference survives (no new type name introduced).
    const finalMsg: Anthropic.Messages.Message = await stream.finalMessage();
    logCacheUsage(model, finalMsg.usage);
    if (finalMsg.stop_reason !== "tool_use") {
      return fullText;
    }

    // Tool use — client-managed tools resolve server-side here. During
    // the dispatch the user sees no stream output (usually sub-second
    // for the FTS path); then the next iteration's stream resumes
    // appending text to `fullText` and firing onDelta.
    const toolUseBlocks = finalMsg.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    const toolResults = await dispatchWithBudget(toolUseBlocks, toolCallsUsed);
    toolCallsUsed += toolUseBlocks.length;
    messages.push(
      {
        role: "assistant",
        content: toContentBlockParams(finalMsg.content),
      },
      { role: "user", content: toolResults },
    );
  }

  return fullText;
}

export type DraftPick = {
  playerName: string;
  position: string;
  team: string;
  round: number;
};

export async function generateDraftCommentary(
  systemPrompt: string,
  pick: DraftPick,
  richContext: string | null = null,
  opts: ChatGenerateOptions = {},
): Promise<string> {
  const model = resolveAgentModel(opts.model);
  // Draft commentary is a one-shot announcement, so dialogue-mode addendum
  // (length lift + followups) is intentionally ignored here — always false.
  const userPrompt = [
    `You just drafted ${pick.playerName}, ${pick.position} from the ${pick.team},`,
    `in round ${pick.round} of your fantasy draft. Announce your pick to the group chat.`,
    "Be extremely confident. Explain why this is a genius pick. Make a bold",
    "prediction about their season. Remember, you think all your picks are",
    "brilliant even though they're terrible.",
    "",
    "Output ONLY the announcement text — no prefixes, no quoting, no meta commentary.",
  ].join("\n");

  const response = await trackedMessagesCreate(
    getClient(),
    {
      userId: opts.userId ?? null,
      operation: "draft.commentary",
      conversationId: opts.conversationId ?? null,
      characterId: opts.characterId ?? null,
    },
    {
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0.9,
      system: composeSystemBlocks(systemPrompt, richContext, false),
      tools: [WEB_SEARCH_TOOL],
      messages: [{ role: "user", content: userPrompt }],
    },
  );
  logCacheUsage(model, response.usage);

  return requireText(response.content);
}
