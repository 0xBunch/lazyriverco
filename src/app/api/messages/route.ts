import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  CHAT_PAGE_SIZE,
  type ChatMessageDTO,
  type MessagesResponse,
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
      module: "chat",
      // `gte` (not `gt`) + client-side dedupe-by-id on the feed side avoids
      // losing messages that share a millisecond timestamp under bursty inserts.
      ...(after ? { createdAt: { gte: after } } : {}),
    },
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: CHAT_PAGE_SIZE,
    include: {
      user: { select: { id: true, name: true, displayName: true } },
      character: { select: { id: true, name: true, displayName: true } },
    },
  });

  // When loading initial page we fetched DESC to get the newest N; flip to
  // ASC so the client renders oldest→newest without sorting.
  const ordered = after ? rows : rows.reverse();

  const messages: ChatMessageDTO[] = ordered.map((m) => {
    if (m.authorType === "USER" && m.user) {
      return {
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        author: {
          id: m.user.id,
          name: m.user.name,
          displayName: m.user.displayName,
          kind: "USER",
        },
      };
    }
    if (m.authorType === "CHARACTER" && m.character) {
      return {
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        author: {
          id: m.character.id,
          name: m.character.name,
          displayName: m.character.displayName,
          kind: "CHARACTER",
        },
      };
    }
    // Shouldn't happen: authorType + matching join are guaranteed by the
    // Prisma FK constraints. Log loudly rather than silently dropping.
    console.error(
      `[api/messages] dropping message with impossible author state: id=${m.id} authorType=${m.authorType}`,
    );
    return null;
  }).filter((m): m is ChatMessageDTO => m !== null);

  const res: MessagesResponse = { messages };
  return NextResponse.json(res, {
    status: 200,
    // Never cache — we're polling, freshness matters.
    headers: { "Cache-Control": "no-store" },
  });
}
