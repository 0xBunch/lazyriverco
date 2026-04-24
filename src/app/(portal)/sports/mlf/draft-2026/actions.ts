"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateDraftPickReaction } from "@/lib/sleeper-ai";

const ROUTE = "/sports/mlf/draft-2026";

function flash(key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${ROUTE}?${q}`);
}

/**
 * Manager-facing lock action. Mirrors the Goodell-podium moment:
 *
 *   1. Verify the caller owns the on-clock slot (or is admin acting on behalf).
 *   2. Verify the player exists in the draft pool and hasn't been picked.
 *   3. Transaction:
 *      a. Stamp this pick: status=locked, playerId, lockedAt, lockedById.
 *      b. Roll a random unused DraftAnnouncerImage and bind it to this pick.
 *      c. Promote the next pick (overallPick+1) to onClock, or flip the
 *         draft to "complete" if this was the last one.
 *   4. Revalidate the public page so polling clients pick up the change.
 *
 * AI reaction generation is intentionally deferred (fires separately from
 * a background job in Phase 3). A draft pick reaction row stays absent
 * until that pipeline ships — the UI renders a "[ reaction queued ]"
 * placeholder in the meantime.
 */
export async function lockPick(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) flash("error", "Sign in first.");

  const pickId = String(fd.get("pickId") ?? "").trim();
  const playerId = String(fd.get("playerId") ?? "").trim();
  if (!pickId || !playerId) flash("error", "Missing pick or player.");

  const pick = await prisma.draftPick.findUnique({
    where: { id: pickId },
    select: {
      id: true,
      draftId: true,
      userId: true,
      status: true,
      overallPick: true,
    },
  });
  if (!pick) flash("error", "Pick not found.");
  if (pick.status !== "onClock") flash("error", "That pick isn't on the clock.");

  const actorIsAdmin = user.role === "ADMIN";
  if (pick.userId !== user.id && !actorIsAdmin) {
    flash("error", "Not your pick.");
  }

  // Player must be in pool (active, not removed) and not already drafted.
  const [poolRow, alreadyPicked] = await Promise.all([
    prisma.draftPoolPlayer.findFirst({
      where: { draftId: pick.draftId, playerId, removed: false },
      select: { id: true },
    }),
    prisma.draftPick.findFirst({
      where: { draftId: pick.draftId, playerId, status: "locked" },
      select: { id: true },
    }),
  ]);
  if (!poolRow) flash("error", "Player isn't in the rookie pool.");
  if (alreadyPicked) flash("error", "Player was already drafted.");

  const nextPick = await prisma.draftPick.findFirst({
    where: {
      draftId: pick.draftId,
      overallPick: pick.overallPick + 1,
    },
    select: { id: true },
  });

  // Pick an unused announcer image at random. Postgres `ORDER BY random()`
  // is fine at this scale; the pool is tiny. If the pool is empty or fully
  // consumed, `randomImage` is null and the Goodell box falls back to the
  // text-only league seal.
  const eligible = await prisma.draftAnnouncerImage.findMany({
    where: { draftId: pick.draftId, consumedPickId: null },
    select: { id: true },
  });
  const randomImage =
    eligible.length > 0
      ? eligible[Math.floor(Math.random() * eligible.length)]
      : null;

  const now = new Date();
  await prisma.$transaction([
    prisma.draftPick.update({
      where: { id: pick.id },
      data: {
        status: "locked",
        playerId,
        lockedAt: now,
        lockedById: user.id,
      },
    }),
    ...(randomImage
      ? [
          prisma.draftAnnouncerImage.update({
            where: { id: randomImage.id },
            data: { consumedPickId: pick.id },
          }),
        ]
      : []),
    nextPick
      ? prisma.draftPick.update({
          where: { id: nextPick.id },
          data: { status: "onClock", onClockAt: now },
        })
      : prisma.draftRoom.update({
          where: { id: pick.draftId },
          data: { status: "complete", closedAt: now },
        }),
  ]);

  // Fire the reaction generator in the background. Errors are logged but
  // never block the lock flow — a missing reaction is a cosmetic miss at
  // worst; the pick itself is already committed. The reaction row
  // populates async and the next page load (manual refresh or poll)
  // picks it up.
  void generateDraftPickReaction(pick.id).catch((err) => {
    console.warn(`[lockPick] reaction generation failed for ${pick.id}:`, err);
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?msg=locked`);
}
