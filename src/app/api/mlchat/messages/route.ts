import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUTHOR_SELECT, toDTO } from "@/lib/chat";
import { DEFAULT_CHANNEL_ID } from "@/lib/channels";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import {
  MLCHAT_MAX_CONTENT_LENGTH,
  MLCHAT_PAGE_SIZE,
} from "@/lib/mlchat/types";

export const runtime = "nodejs";

/**
 * GET /api/mlchat/messages
 *
 * Returns the most recent MLCHAT_PAGE_SIZE messages in the `mensleague`
 * channel, oldest first. Reversing server-side keeps the wire shape
 * chronological — the client renders in order without a second sort.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = await prisma.message.findMany({
    where: { channelId: DEFAULT_CHANNEL_ID },
    orderBy: { createdAt: "desc" },
    take: MLCHAT_PAGE_SIZE,
    include: {
      user: { select: AUTHOR_SELECT },
      character: { select: AUTHOR_SELECT },
    },
  });

  // toDTO returns null for rows with impossible author state — filter
  // before reversing so the indexes stay clean.
  const dtos = messages
    .map((m) => toDTO(m))
    .filter((d): d is NonNullable<ReturnType<typeof toDTO>> => d !== null)
    .reverse();

  return NextResponse.json({ messages: dtos });
}

/**
 * POST /api/mlchat/messages
 *
 * Append a USER message to the room. The Postgres trigger fires NOTIFY
 * on insert, which the mlchat listener fans out to every open SSE
 * connection — including this user's own tab. The client de-dupes on
 * message id.
 *
 * Rate limit reuses the existing `conversation.message` bucket: same
 * user, same total typing volume, regardless of which surface.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const content =
    typeof body === "object" &&
    body !== null &&
    "content" in body &&
    typeof (body as { content: unknown }).content === "string"
      ? ((body as { content: string }).content).trim()
      : "";

  if (!content) {
    return NextResponse.json(
      { error: "Message cannot be empty" },
      { status: 400 },
    );
  }
  if (content.length > MLCHAT_MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `Message too long (max ${MLCHAT_MAX_CONTENT_LENGTH})` },
      { status: 400 },
    );
  }

  // TODO(pr-2): replace [] with extractMentions(content, allowlist) so
  // the listener can fan out agent replies without a Prisma round-trip.
  const message = await prisma.message.create({
    data: {
      content,
      authorType: "USER",
      userId: user.id,
      module: "chat",
      channelId: DEFAULT_CHANNEL_ID,
      mentionedAgentIds: [],
    },
    include: {
      user: { select: AUTHOR_SELECT },
      character: { select: AUTHOR_SELECT },
    },
  });

  const dto = toDTO(message);
  if (!dto) {
    return NextResponse.json(
      { error: "Failed to serialize message" },
      { status: 500 },
    );
  }

  return NextResponse.json({ message: dto });
}
