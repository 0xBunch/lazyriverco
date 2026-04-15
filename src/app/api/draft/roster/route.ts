import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  CURRENT_SEASON,
  DRAFTING_CHARACTER_NAME,
  type RosterEntryDTO,
  type RosterResponse,
} from "@/lib/draft";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const character = await prisma.character.findUnique({
    where: { name: DRAFTING_CHARACTER_NAME },
  });
  if (!character) {
    return NextResponse.json(
      { error: `Character "${DRAFTING_CHARACTER_NAME}" not found` },
      { status: 500 },
    );
  }

  const roster = await prisma.roster.findMany({
    where: { characterId: character.id, season: CURRENT_SEASON },
    orderBy: { createdAt: "asc" },
  });

  // Direct commentary lookup via the soft FK set in the pick route. Missing
  // IDs (waiver pickups, edits) simply resolve to null commentary.
  const commentaryIds = roster
    .map((r) => r.commentaryMessageId)
    .filter((id): id is string => Boolean(id));
  const commentaryMessages =
    commentaryIds.length > 0
      ? await prisma.message.findMany({
          where: { id: { in: commentaryIds } },
          select: { id: true, content: true, createdAt: true },
        })
      : [];
  const commentaryById = new Map(commentaryMessages.map((m) => [m.id, m]));

  const rosterDTO: RosterEntryDTO[] = roster.map((r, index) => {
    const msg = r.commentaryMessageId
      ? commentaryById.get(r.commentaryMessageId)
      : undefined;
    return {
      id: r.id,
      playerName: r.playerName,
      position: r.position,
      acquiredVia: r.acquiredVia,
      season: r.season,
      weekAcquired: r.weekAcquired,
      commentary: msg?.content ?? null,
      commentaryAt: msg?.createdAt.toISOString() ?? null,
      createdAtOrder: index,
    };
  });

  const res: RosterResponse = {
    season: CURRENT_SEASON,
    character: {
      id: character.id,
      name: character.name,
      displayName: character.displayName,
    },
    roster: rosterDTO,
  };
  return NextResponse.json(res, {
    headers: { "Cache-Control": "no-store" },
  });
}
