import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateDraftCommentary } from "@/lib/anthropic";
import { runOrchestrator } from "@/lib/orchestrator";
import {
  CURRENT_SEASON,
  DRAFTING_CHARACTER_NAME,
  type PickResponse,
} from "@/lib/draft";

export const runtime = "nodejs";

// Fallback commentary used only when the Anthropic API call fails. Keeps the
// draft flow deterministic even without a working API key — the admin still
// sees a pick land, and the chat still gets an announcement, just in a
// generic voice. Task 07's live orchestrator will do better once keyed.
function fallbackCommentary(playerName: string, round: number): string {
  return `brothers... round ${round}. ${playerName}. trust the process. this is the year.`;
}

export async function POST(): Promise<NextResponse<PickResponse>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json<PickResponse>(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json<PickResponse>(
      { ok: false, error: "Forbidden — admin only" },
      { status: 403 },
    );
  }

  const character = await prisma.character.findUnique({
    where: { name: DRAFTING_CHARACTER_NAME },
  });
  if (!character) {
    return NextResponse.json<PickResponse>(
      { ok: false, error: `Character "${DRAFTING_CHARACTER_NAME}" not found` },
      { status: 500 },
    );
  }

  const undrafted = await prisma.playerPool.findMany({
    where: { season: CURRENT_SEASON, drafted: false },
  });
  if (undrafted.length === 0) {
    return NextResponse.json<PickResponse>(
      { ok: false, error: "Player pool is empty" },
      { status: 409 },
    );
  }

  const picked = undrafted[Math.floor(Math.random() * undrafted.length)]!;

  // Round = joey's current roster count + 1.
  const currentRosterCount = await prisma.roster.count({
    where: { characterId: character.id, season: CURRENT_SEASON },
  });
  const round = currentRosterCount + 1;

  // Generate commentary OUTSIDE the transaction — it's slow (Anthropic API
  // call) and we don't want it holding a DB transaction open. If it fails,
  // we fall back to a static line so the pick still lands.
  let commentary: string;
  try {
    commentary = await generateDraftCommentary(character.systemPrompt, {
      playerName: picked.playerName,
      position: picked.position,
      team: picked.team,
      round,
    });
  } catch (err) {
    console.error("[draft/pick] generateDraftCommentary failed:", err);
    commentary = fallbackCommentary(picked.playerName, round);
  }

  // Persist in a transaction so the mark-drafted / message-create /
  // roster-create are atomic. The message is created first so its id can
  // be pinned into the roster row's commentaryMessageId — that lets the
  // roster endpoint render the pick announcement without brittle
  // chat-log heuristics.
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.playerPool.findUnique({
      where: { id: picked.id },
    });
    if (!current || current.drafted) {
      throw new Error("Player was already drafted");
    }

    await tx.playerPool.update({
      where: { id: picked.id },
      data: { drafted: true },
    });

    const chatMessage = await tx.message.create({
      data: {
        content: commentary,
        authorType: "CHARACTER",
        characterId: character.id,
        module: "chat",
      },
    });

    await tx.roster.create({
      data: {
        characterId: character.id,
        playerName: picked.playerName,
        position: picked.position,
        acquiredVia: "draft",
        season: CURRENT_SEASON,
        weekAcquired: null,
        active: true,
        commentaryMessageId: chatMessage.id,
      },
    });

    return { chatMessage };
  });

  // Fire-and-forget: let Billy/Andreea react to Joey's pick via the normal
  // orchestrator flow. The cooldown check excludes Joey (he just posted),
  // so this doesn't self-recurse.
  void runOrchestrator(result.chatMessage.id).catch((e) => {
    console.error(
      "[draft/pick] orchestrator failed for pick message",
      result.chatMessage.id,
      e,
    );
  });

  return NextResponse.json<PickResponse>(
    {
      ok: true,
      pick: {
        player: {
          id: picked.id,
          playerName: picked.playerName,
          position: picked.position,
          team: picked.team,
          tagline: picked.tagline,
          drafted: true,
        },
        round,
        commentary,
      },
    },
    { status: 201 },
  );
}

