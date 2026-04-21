import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import { streamCharacterResponse, resolveAgentModel } from "@/lib/anthropic";
import { extractFollowups, FOLLOWUPS_OPEN_TAG } from "@/lib/followups";
import { buildRichContext } from "@/lib/character-context";
import { loadMessageContext } from "@/lib/orchestrator";
import { selectContext } from "@/lib/select-context";
import { getUpcomingCalendarEntries } from "@/lib/calendar-context";
import { parseSentinel } from "@/lib/agent-sentinels";
import { AUTHOR_SELECT, toDTO } from "@/lib/chat";
import {
  generateImage,
  isImageGenerationEnabled,
  ImageGenerationError,
} from "@/lib/imageGen";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTENT_LENGTH = 4000;
// Image models have much tighter prompt limits than chat turns: SDXL's
// CLIP encoder accepts ~77 tokens, Flux's T5 encoder ~256. 1000 chars is
// conservatively above either token budget — longer prompts get silently
// truncated by the tokenizer, so the cap mostly protects against a
// pasted wall of text that would waste a Replicate call.
const MAX_IMAGE_PROMPT_LENGTH = 1000;
const MAX_REPLY_CHARS = 8_000;
const CONTEXT_MESSAGES = 15;

/**
 * POST /api/conversations/[id]/stream
 *
 * Streaming endpoint for the live conversation turn. Validates + creates
 * the user message, then streams the agent reply as SSE events:
 *
 *   event: user_message   — confirmed user message DTO
 *   event: token          — { delta: "text chunk" }
 *   event: followups      — { messageId, suggestions: string[] }
 *                           Optional. Only emitted for dialogue-mode
 *                           agents that chose to include <followups>
 *                           suggestions at the end of their reply. The
 *                           <followups> tag is stripped from the token
 *                           stream and from the persisted message — it
 *                           reaches the client only through this event.
 *   event: done           — { message: final CHARACTER message DTO }
 *   event: error          — { message: "what went wrong" }
 *
 * The client reads these via fetch + ReadableStream reader, rendering
 * tokens as they arrive for a real-time typing effect. After the stream
 * closes, the full reply is persisted and available via the regular
 * GET /api/conversations/[id]/messages poll endpoint.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // --- Pre-stream validation (returns JSON errors, not SSE) ----------------

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, ownerId: user.id, archivedAt: null },
    include: { character: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Expected application/json" },
      { status: 415 },
    );
  }

  try {
    await assertWithinLimit(user.id, "conversation.message", {
      maxPerMinute: 30,
      maxPerDay: 400,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message },
        {
          status: 429,
          headers: { "Retry-After": String(err.retryAfterSeconds) },
        },
      );
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Two modes:
  //   { content: "..." } → create a new USER message + stream the reply
  //   {} (no content)     → stream a reply for the latest USER message
  //                         (used on mount when ConversationView detects
  //                         a USER message with no CHARACTER reply yet)
  const hasContent =
    typeof body === "object" &&
    body !== null &&
    "content" in body &&
    typeof (body as { content: unknown }).content === "string";

  // Optional image-generation mode flag. When true and enabled, the reply
  // is a generated image instead of a Claude text reply. Works in both
  // modes: with fresh `content` (chat-page toggle sends a prompt as a
  // new USER message) OR reply-to-latest (landing-page flow where the
  // USER message was already persisted by POST /api/conversations and
  // we carry `?image=1` through the navigation).
  const imageMode =
    typeof body === "object" &&
    body !== null &&
    "imageGenerationMode" in body &&
    (body as { imageGenerationMode: unknown }).imageGenerationMode === true;

  // Optional NSFW flag — ONLY meaningful when imageMode is also true.
  // Routes the generation to a community SDXL fine-tune with the safety
  // checker disabled. When imageMode is false we force nsfwMode to false
  // explicitly — don't ever let nsfwMode survive without imageMode or a
  // future refactor that reorders flag parsing could route a Claude turn
  // through the image-gen branch.
  const nsfwRequested =
    typeof body === "object" &&
    body !== null &&
    "nsfwMode" in body &&
    (body as { nsfwMode: unknown }).nsfwMode === true;
  const nsfwMode = imageMode && nsfwRequested;

  if (imageMode) {
    if (!isImageGenerationEnabled()) {
      return NextResponse.json(
        { error: "Image generation is currently disabled." },
        { status: 503 },
      );
    }
    // When the prompt is in the body, enforce the tighter image-mode
    // cap before we even create a user message. In reply-to-latest
    // mode the equivalent check happens on `persistedUserMessage.content`
    // inside the image-mode short-circuit block below.
    if (hasContent) {
      const promptLength = ((body as { content: string }).content).trim().length;
      if (promptLength > MAX_IMAGE_PROMPT_LENGTH) {
        return NextResponse.json(
          { error: `Image prompt too long (max ${MAX_IMAGE_PROMPT_LENGTH})` },
          { status: 400 },
        );
      }
    }
    // Image generation is ~100x more expensive per call than a Claude
    // message (Replicate GPU time + R2 storage), so it gets its own
    // tighter bucket on top of the conversation-level limit above.
    try {
      await assertWithinLimit(user.id, "image.generate", {
        maxPerMinute: 5,
        maxPerDay: 50,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: err.message },
          {
            status: 429,
            headers: { "Retry-After": String(err.retryAfterSeconds) },
          },
        );
      }
      throw err;
    }
  }

  let userMessage;
  let userDTO;

  if (hasContent) {
    const content = ((body as { content: string }).content).trim();
    if (!content) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 },
      );
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_CONTENT_LENGTH})` },
        { status: 400 },
      );
    }

    userMessage = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          content,
          authorType: "USER",
          userId: user.id,
          module: "chat",
          conversationId: params.id,
        },
        include: {
          user: { select: AUTHOR_SELECT },
          character: { select: AUTHOR_SELECT },
        },
      });
      await tx.conversation.update({
        where: { id: params.id },
        data: { lastMessageAt: new Date() },
      });
      return msg;
    });

    userDTO = toDTO(userMessage);
    if (!userDTO) {
      return NextResponse.json(
        { error: "Failed to serialize user message" },
        { status: 500 },
      );
    }
  } else {
    // Reply-to-latest mode: find the most recent USER message.
    userMessage = await prisma.message.findFirst({
      where: { conversationId: params.id, authorType: "USER" },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: AUTHOR_SELECT },
        character: { select: AUTHOR_SELECT },
      },
    });
    if (!userMessage) {
      return NextResponse.json(
        { error: "No user message to reply to" },
        { status: 400 },
      );
    }
    userDTO = null; // client already has this message via poll
  }

  // --- Image-generation mode: short-circuit the Claude pipeline -------------
  // When imageMode is on, we bypass context loading + Claude entirely.
  // The user message is already persisted; we generate an image, persist
  // a CHARACTER reply whose content is the public R2 URL (rendered inline
  // by ChatMessage.extractSafeMediaUrls), and close the stream.

  if (imageMode) {
    // Narrow: image mode works in both hasContent and reply-to-latest
    // modes. In hasContent we just created the message above; in reply-
    // to-latest we fetched it. Either way userMessage is assigned.
    // Capturing into a const lets TS drop the `undefined` from the outer
    // `let` declaration inside this closure.
    const persistedUserMessage = userMessage;
    if (!persistedUserMessage) {
      return NextResponse.json(
        { error: "Image generation requires a prompt" },
        { status: 400 },
      );
    }
    // Enforce the image-mode prompt cap against the resolved message.
    // Same JSON 400 shape as the hasContent pre-persist check so both
    // error paths look identical to the caller.
    const trimmedPrompt = persistedUserMessage.content.trim();
    if (trimmedPrompt.length > MAX_IMAGE_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Image prompt too long (max ${MAX_IMAGE_PROMPT_LENGTH})` },
        { status: 400 },
      );
    }
    // Reply-to-latest + imageMode guard: only auto-generate for recent
    // user messages. Matches the 30s client-side recency check in
    // ConversationView's auto-trigger so a stale bookmark with ?image=1
    // can't kick off a Replicate call against an old message.
    if (!hasContent) {
      const ageMs = Date.now() - persistedUserMessage.createdAt.getTime();
      if (ageMs > 30_000) {
        return NextResponse.json(
          { error: "User message is too old to auto-generate an image" },
          { status: 400 },
        );
      }
    }
    const encoder = new TextEncoder();
    const imageCharacter = conversation.character;

    const sseStream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        }

        if (userDTO) {
          send("user_message", { message: userDTO });
        }

        try {
          const result = await generateImage({
            prompt: trimmedPrompt,
            mode: nsfwMode ? "nsfw" : "sfw",
          });

          // Content stored on the message is just the public URL. The chat
          // message component recognises /generated/<uuid>.<ext> under the
          // R2 public origin and renders it as an inline <img>.
          //
          // TODO(image-gen): persist an `isNsfw` flag on the Message row
          // when nsfwMode was used, so sidebar previews / admin exports /
          // future search can filter or gate NSFW thumbnails. Currently
          // not needed — single-user app, no preview surfaces — but the
          // flag becomes load-bearing once multi-user or export lands.
          const replyMessage = await prisma.$transaction(async (tx) => {
            const msg = await tx.message.create({
              data: {
                content: result.publicUrl,
                authorType: "CHARACTER",
                characterId: imageCharacter.id,
                module: "chat",
                conversationId: conversation.id,
              },
              include: {
                user: { select: AUTHOR_SELECT },
                character: { select: AUTHOR_SELECT },
              },
            });
            await tx.conversation.update({
              where: { id: conversation.id },
              data: { lastMessageAt: new Date() },
            });
            return msg;
          });

          const replyDTO = toDTO(replyMessage);
          if (!replyDTO) {
            send("error", {
              message: "Failed to serialize generated image message",
            });
          } else {
            send("done", { message: replyDTO });
          }
        } catch (err) {
          console.error("[stream] image generation failed:", err);
          const message =
            err instanceof ImageGenerationError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Image generation failed";
          send("error", { message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // --- Build context for the agent -----------------------------------------

  const character = conversation.character;

  // Three-way parallel fan-out: load transcript, select relevant
  // knowledge via Haiku, and fetch upcoming calendar entries. All three
  // are independent and complete before buildRichContext runs.
  const [{ contextLines }, selection, calendarEntries] = await Promise.all([
    loadMessageContext({
      where: { conversationId: conversation.id },
      take: CONTEXT_MESSAGES,
      excludeMessageId: userMessage.id,
    }),
    selectContext(userMessage.content, {
      userId: user.id,
      conversationId: conversation.id,
    }),
    getUpcomingCalendarEntries(),
  ]);

  const richContext = await buildRichContext({
    characterId: character.id,
    participantUserIds: [conversation.ownerId],
    includeMedia: true,
    selectedLoreIds: selection.loreIds,
    selectedMediaIds: selection.mediaIds,
    calendarEntries,
  });

  const newLine = {
    displayName: user.displayName,
    content: userMessage.content,
  };

  // --- SSE stream ----------------------------------------------------------

  const encoder = new TextEncoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      }

      // Send the confirmed user message only when we created a new one.
      // In reply-to-latest mode, the client already has the message via poll.
      if (userDTO) {
        send("user_message", { message: userDTO });
      }

      try {
        // Token emission with two bits of state:
        //   - emittedCharCount caps bytes the client ever sees (defense
        //     against a pathological reply — the cap is independent of
        //     whatever the model streams).
        //   - suppressFollowups flips true the moment <followups> starts,
        //     muting the rest of the stream. The tag body + any content
        //     after it reaches the client only via the `followups` +
        //     `done` events with the canonical cleaned DTO.
        // tokenBuffer holds back the last FOLLOWUPS_OPEN_TAG.length-1
        // characters so a tag split across two deltas (e.g. `<fol` then
        // `lowups>`) is still detected before any of it leaks.
        let emittedCharCount = 0;
        let suppressFollowups = false;
        let tokenBuffer = "";
        const holdBack = FOLLOWUPS_OPEN_TAG.length - 1;

        function sendTokenSafe(text: string) {
          if (!text) return;
          emittedCharCount += text.length;
          if (emittedCharCount <= MAX_REPLY_CHARS) {
            send("token", { delta: text });
          }
        }

        const fullReply = await streamCharacterResponse(
          character.systemPrompt,
          contextLines,
          newLine,
          richContext || null,
          (delta) => {
            if (suppressFollowups) return;
            tokenBuffer += delta;
            const tagIdx = tokenBuffer.indexOf(FOLLOWUPS_OPEN_TAG);
            if (tagIdx >= 0) {
              sendTokenSafe(tokenBuffer.slice(0, tagIdx));
              suppressFollowups = true;
              tokenBuffer = "";
              return;
            }
            if (tokenBuffer.length > holdBack) {
              const flushable = tokenBuffer.slice(
                0,
                tokenBuffer.length - holdBack,
              );
              tokenBuffer = tokenBuffer.slice(
                tokenBuffer.length - holdBack,
              );
              sendTokenSafe(flushable);
            }
          },
          {
            model: resolveAgentModel(character.model),
            dialogueMode: character.dialogueMode,
            userId: user.id,
            conversationId: conversation.id,
            characterId: character.id,
          },
        );

        // Tag never appeared — drain the hold-back residue.
        if (!suppressFollowups && tokenBuffer) {
          sendTokenSafe(tokenBuffer);
          tokenBuffer = "";
        }

        // Pull the optional <followups> block out of the full reply. The
        // persisted message and the DTO that reaches the client are the
        // cleaned version; suggestions flow separately as an SSE event.
        const { cleaned: cleanedReply, suggestions } =
          extractFollowups(fullReply);

        const truncated = cleanedReply.slice(0, MAX_REPLY_CHARS).trim();
        if (!truncated) {
          send("error", { message: "Empty reply from model" });
          controller.close();
          return;
        }

        // Sentinel check: don't persist an empty-bubble message
        const activeChars = await prisma.character.findMany({
          where: { active: true },
          select: { name: true },
        });
        const allowlist = activeChars.map((c) => c.name);
        const { cleaned: visible } = parseSentinel(truncated, allowlist);
        if (!visible.trim()) {
          send("done", { message: null });
          controller.close();
          return;
        }

        // Persist the followups-stripped reply (suggest-agent sentinel
        // is preserved for DTO re-parsing in toDTO()).
        const replyMessage = await prisma.$transaction(async (tx) => {
          const msg = await tx.message.create({
            data: {
              content: truncated,
              authorType: "CHARACTER",
              characterId: character.id,
              module: "chat",
              conversationId: conversation.id,
            },
            include: {
              user: { select: AUTHOR_SELECT },
              character: { select: AUTHOR_SELECT },
            },
          });
          await tx.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          });
          return msg;
        });

        const replyDTO = toDTO(replyMessage, allowlist);
        send("done", { message: replyDTO });
        if (replyDTO && suggestions.length > 0) {
          send("followups", {
            messageId: replyDTO.id,
            suggestions,
          });
        }
      } catch (err) {
        console.error("[stream] generation failed:", err);
        send("error", {
          message: err instanceof Error ? err.message : "Generation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
