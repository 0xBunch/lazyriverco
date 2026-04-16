import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runConversationOrchestrator } from "@/lib/orchestrator";
import { getDefaultCharacter } from "@/lib/characters";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import {
  AUTHOR_SELECT,
  toDTO,
  type ConversationListItem,
  type CreateConversationResponse,
  type ListConversationsResponse,
} from "@/lib/chat";

export const runtime = "nodejs";

const MAX_CONTENT_LENGTH = 4000;
const CONVERSATION_LIST_LIMIT = 50;
const TITLE_SOURCE_LENGTH = 50;

// Narrow character fetch for list + detail endpoints. Never selects
// systemPrompt — that's admin-only and never ships to the client.
const CHARACTER_SELECT = {
  id: true,
  name: true,
  displayName: true,
  avatarUrl: true,
} as const;

function toListItem(c: {
  id: string;
  title: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  character: {
    id: string;
    name: string;
    displayName: string;
    avatarUrl: string | null;
  };
}): ConversationListItem {
  return {
    id: c.id,
    title: c.title,
    character: c.character,
    lastMessageAt: c.lastMessageAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
  };
}

/**
 * GET /api/conversations — list the current user's non-archived
 * conversations ordered by lastMessageAt DESC. Backs the sidebar's
 * recent-conversations strip (Task 6).
 */
export async function GET(): Promise<
  NextResponse<ListConversationsResponse | { error: string }>
> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.conversation.findMany({
    where: { ownerId: user.id, archivedAt: null },
    orderBy: { lastMessageAt: "desc" },
    take: CONVERSATION_LIST_LIMIT,
    include: {
      character: { select: CHARACTER_SELECT },
    },
  });

  return NextResponse.json<ListConversationsResponse>(
    { conversations: rows.map(toListItem) },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST /api/conversations — start a new thread with the default
 * character (or an override) and persist the first user message in a
 * single transaction. Fires the conversation orchestrator fire-and-
 * forget so the HTTP response doesn't wait on the agent reply.
 *
 * Body: `{ content: string, characterId?: string }`
 * Response: `{ conversation: ConversationListItem, message: ChatMessageDTO }`
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<CreateConversationResponse>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json<CreateConversationResponse>(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  // JSON-only — rejects form posts and browsers that default to text/plain.
  // Narrows CSRF exposure: SameSite=Lax already blocks cross-origin POSTs
  // by default, this is belt-and-suspenders.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json<CreateConversationResponse>(
      { error: "Expected application/json" },
      { status: 415 },
    );
  }

  // Rate limit before parsing — a burst of malformed POSTs shouldn't
  // slip past the limiter just because they fail validation downstream.
  try {
    await assertWithinLimit(user.id, "conversation.create", {
      maxPerMinute: 10,
      maxPerDay: 100,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json<CreateConversationResponse>(
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
    return NextResponse.json<CreateConversationResponse>(
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
    return NextResponse.json<CreateConversationResponse>(
      { error: "Message cannot be empty" },
      { status: 400 },
    );
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json<CreateConversationResponse>(
      { error: `Message too long (max ${MAX_CONTENT_LENGTH})` },
      { status: 400 },
    );
  }

  // Caller can override the default character (Moises) via an explicit
  // { characterId } in the body — used by the agent-handoff flow where
  // the landing page is pre-filled with agent=joey-barfdog query param.
  const requestedCharacterId =
    typeof body === "object" &&
    body !== null &&
    "characterId" in body &&
    typeof (body as { characterId: unknown }).characterId === "string"
      ? (body as { characterId: string }).characterId
      : null;

  let characterId: string;
  if (requestedCharacterId) {
    const exists = await prisma.character.findFirst({
      where: { id: requestedCharacterId, active: true },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json<CreateConversationResponse>(
        { error: "Character not found or inactive" },
        { status: 400 },
      );
    }
    characterId = requestedCharacterId;
  } else {
    const defaultChar = await getDefaultCharacter();
    characterId = defaultChar.id;
  }

  // Single-line title from the first ~50 chars of the user's prompt,
  // with any whitespace collapsed so newlines don't blow up the sidebar.
  const title = content.slice(0, TITLE_SOURCE_LENGTH).replace(/\s+/g, " ").trim();

  // Transaction: create the Conversation row + its first USER Message
  // atomically so the sidebar list and the thread detail always see a
  // consistent state.
  const { conversation, message } = await prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.create({
      data: {
        ownerId: user.id,
        characterId,
        title,
        lastMessageAt: new Date(),
      },
      include: {
        character: { select: CHARACTER_SELECT },
      },
    });
    const msg = await tx.message.create({
      data: {
        content,
        authorType: "USER",
        userId: user.id,
        module: "chat",
        conversationId: conv.id,
      },
      include: {
        user: { select: AUTHOR_SELECT },
        character: { select: AUTHOR_SELECT },
      },
    });
    return { conversation: conv, message: msg };
  });

  const messageDTO = toDTO(message);
  if (!messageDTO) {
    return NextResponse.json<CreateConversationResponse>(
      { error: "Failed to serialize created message" },
      { status: 500 },
    );
  }

  // Don't fire the orchestrator here. ConversationView will auto-trigger
  // the streaming endpoint on mount when it detects the first USER message
  // has no CHARACTER reply. This ensures ALL replies — including the first
  // one — stream token-by-token instead of waiting for fire-and-forget +
  // poll pickup.

  return NextResponse.json<CreateConversationResponse>(
    {
      conversation: toListItem(conversation),
      message: messageDTO,
    },
    { status: 201 },
  );
}
