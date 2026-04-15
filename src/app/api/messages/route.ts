import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runOrchestrator } from "@/lib/orchestrator";
import { DEFAULT_CHANNEL_ID } from "@/lib/channels";
import {
  AUTHOR_SELECT,
  CHAT_PAGE_SIZE,
  toDTO,
  type ChatMessageDTO,
  type MessagesResponse,
  type PostMessageResponse,
} from "@/lib/chat";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const afterParam = req.nextUrl.searchParams.get("after");
  const after = afterParam ? new Date(afterParam) : null;
  if (after && Number.isNaN(after.getTime())) {
    return NextResponse.json({ error: "Invalid `after`" }, { status: 400 });
  }

  const rows = await prisma.message.findMany({
    where: {
      channelId: DEFAULT_CHANNEL_ID,
      // `gte` (not `gt`) + client-side dedupe-by-id on the feed side avoids
      // losing messages that share a millisecond timestamp under bursty inserts.
      ...(after ? { createdAt: { gte: after } } : {}),
    },
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: CHAT_PAGE_SIZE,
    include: {
      user: { select: AUTHOR_SELECT },
      character: { select: AUTHOR_SELECT },
    },
  });

  // Initial load fetched DESC to grab the newest N; reverse for oldest→newest.
  const ordered = after ? rows : rows.reverse();

  const messages: ChatMessageDTO[] = ordered
    .map(toDTO)
    .filter((m): m is ChatMessageDTO => m !== null);

  const res: MessagesResponse = { messages };
  return NextResponse.json(res, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

const MAX_CONTENT_LENGTH = 4000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json<PostMessageResponse>(
      { error: "Unauthorized" },
      { status: 401 },
    );
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

  const created = await prisma.message.create({
    data: {
      content,
      authorType: "USER",
      userId: user.id,
      module: "chat",
      channelId: DEFAULT_CHANNEL_ID,
    },
    include: {
      user: { select: AUTHOR_SELECT },
      character: { select: AUTHOR_SELECT },
    },
  });

  const dto = toDTO(created);
  if (!dto) {
    // Should be unreachable for a just-created USER message.
    return NextResponse.json<PostMessageResponse>(
      { error: "Failed to serialize created message" },
      { status: 500 },
    );
  }

  // Fire-and-forget orchestrator kick. Await-less: any error from Task 07's
  // implementation must NOT block the user's message confirmation.
  void runOrchestrator(created.id).catch((e) => {
    console.error("[orchestrator] failed to run for message", created.id, e);
  });

  return NextResponse.json<PostMessageResponse>(
    { message: dto },
    { status: 201 },
  );
}
