import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runConversationOrchestrator } from "@/lib/orchestrator";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import {
  AUTHOR_SELECT,
  CHAT_PAGE_SIZE,
  toDTO,
  type ChatMessageDTO,
  type MessagesResponse,
  type PostMessageResponse,
} from "@/lib/chat";

export const runtime = "nodejs";

const MAX_CONTENT_LENGTH = 4000;

/**
 * Ownership gate shared by both methods. Returns `{id}` of the owned
 * conversation or null if the current user can't see it. Callers
 * translate null to 404 so we don't leak existence to non-owners.
 */
async function loadOwnedConversation(
  userId: string,
  conversationId: string,
): Promise<{ id: string } | null> {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      ownerId: userId,
      archivedAt: null,
    },
    select: { id: true },
  });
}

/**
 * GET /api/conversations/[id]/messages — paginated poll endpoint.
 * Mirrors the legacy /api/messages contract (?after=ISO + gte-with-
 * client-dedupe) so the new ConversationView can share the
 * useChatPolling hook extracted in Task 0c.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse<MessagesResponse | { error: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owned = await loadOwnedConversation(user.id, params.id);
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const afterParam = req.nextUrl.searchParams.get("after");
  const after = afterParam ? new Date(afterParam) : null;
  if (after && Number.isNaN(after.getTime())) {
    return NextResponse.json({ error: "Invalid `after`" }, { status: 400 });
  }

  const rows = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      // gte (not gt) + client dedupe-by-id avoids losing messages that
      // share a millisecond timestamp under bursty inserts.
      ...(after ? { createdAt: { gte: after } } : {}),
    },
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: CHAT_PAGE_SIZE,
    include: {
      user: { select: AUTHOR_SELECT },
      character: { select: AUTHOR_SELECT },
    },
  });

  // Initial load fetched DESC to grab the newest N; reverse for
  // oldest→newest render order.
  const ordered = after ? rows : rows.reverse();

  // Sentinel parser allowlist — only active character slugs can be
  // targets of a <suggest-agent> handoff.
  const activeCharacters = await prisma.character.findMany({
    where: { active: true },
    select: { name: true },
  });
  const allowlist = activeCharacters.map((c) => c.name);

  const messages: ChatMessageDTO[] = ordered
    .map((m) => toDTO(m, allowlist))
    .filter((m): m is ChatMessageDTO => m !== null);

  return NextResponse.json<MessagesResponse>(
    { messages },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST /api/conversations/[id]/messages — append a user message to
 * an existing thread. Same validation + transaction + fire-and-forget
 * orchestrator shape as the create endpoint, minus the character
 * resolution step (conversation already has a fixed characterId).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse<PostMessageResponse>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json<PostMessageResponse>(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const owned = await loadOwnedConversation(user.id, params.id);
  if (!owned) {
    return NextResponse.json<PostMessageResponse>(
      { error: "Not found" },
      { status: 404 },
    );
  }

  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json<PostMessageResponse>(
      { error: "Expected application/json" },
      { status: 415 },
    );
  }

  // Rate limit: higher cap than conversation.create because normal
  // chatting bursts harder than thread-starting.
  try {
    await assertWithinLimit(user.id, "conversation.message", {
      maxPerMinute: 30,
      maxPerDay: 400,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json<PostMessageResponse>(
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
    return NextResponse.json<PostMessageResponse>(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
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
    return NextResponse.json<PostMessageResponse>(
      { error: "Message cannot be empty" },
      { status: 400 },
    );
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json<PostMessageResponse>(
      { error: `Message too long (max ${MAX_CONTENT_LENGTH})` },
      { status: 400 },
    );
  }

  // Transaction: insert the message + bump lastMessageAt together so
  // the sidebar's ORDER BY lastMessageAt DESC index stays in sync
  // without a separate update round-trip the client can observe in a
  // stale state.
  const created = await prisma.$transaction(async (tx) => {
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

  const dto = toDTO(created);
  if (!dto) {
    return NextResponse.json<PostMessageResponse>(
      { error: "Failed to serialize created message" },
      { status: 500 },
    );
  }

  void runConversationOrchestrator(created.id).catch((e) => {
    console.error(
      "[conversation-orchestrator] failed for message",
      created.id,
      e,
    );
  });

  return NextResponse.json<PostMessageResponse>(
    { message: dto },
    { status: 201 },
  );
}
