import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import { streamCharacterResponse } from "@/lib/anthropic";
import { buildRichContext } from "@/lib/character-context";
import { loadMessageContext } from "@/lib/orchestrator";
import { parseSentinel } from "@/lib/agent-sentinels";
import { AUTHOR_SELECT, toDTO } from "@/lib/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTENT_LENGTH = 4000;
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

  const contentRaw =
    typeof body === "object" &&
    body !== null &&
    "content" in body &&
    typeof (body as { content: unknown }).content === "string"
      ? (body as { content: string }).content
      : "";
  const content = contentRaw.trim();

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

  // --- Create user message -------------------------------------------------

  const userMessage = await prisma.$transaction(async (tx) => {
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

  const userDTO = toDTO(userMessage);
  if (!userDTO) {
    return NextResponse.json(
      { error: "Failed to serialize user message" },
      { status: 500 },
    );
  }

  // --- Build context for the agent -----------------------------------------

  const character = conversation.character;

  const { contextLines } = await loadMessageContext({
    where: { conversationId: conversation.id },
    take: CONTEXT_MESSAGES,
    excludeMessageId: userMessage.id,
  });

  const richContext = await buildRichContext({
    characterId: character.id,
    participantUserIds: [conversation.ownerId],
    includeMedia: true,
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

      // First event: the confirmed user message so the client can render
      // it immediately (no optimistic append needed).
      send("user_message", { message: userDTO });

      try {
        let charCount = 0;
        const fullReply = await streamCharacterResponse(
          character.systemPrompt,
          contextLines,
          newLine,
          richContext || null,
          (delta) => {
            charCount += delta.length;
            if (charCount <= MAX_REPLY_CHARS) {
              send("token", { delta });
            }
          },
        );

        const truncated = fullReply.slice(0, MAX_REPLY_CHARS).trim();
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

        // Persist the full reply (raw, with sentinel for DTO re-parsing)
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
