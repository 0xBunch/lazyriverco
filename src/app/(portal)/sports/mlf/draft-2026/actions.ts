"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { generateDraftPickReaction } from "@/lib/sleeper-ai";
import { findNextPendingPick } from "@/lib/draft";

const ROUTE = "/sports/mlf/draft-2026";

function flash(key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${ROUTE}?${q}`);
}

/**
 * Pause the live draft from the inline commish dock on
 * `/sports/mlf/draft-2026`. Functionally identical to
 * `pauseDraft` in the admin actions, but redirects back to the live
 * page (admin's pauseDraft sends them to `/admin/sports/mlf/draft/[id]`
 * which is wrong when they're already on the live page).
 */
export async function pauseDraftFromLive(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  if (!draftId) flash("error", "Missing draft id.");

  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    select: { status: true },
  });
  if (!draft) flash("error", "Draft not found.");
  if (draft.status !== "live") {
    flash("error", `Can only pause a live draft (currently ${draft.status}).`);
  }

  await prisma.draftRoom.update({
    where: { id: draftId },
    data: { status: "paused" },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?msg=paused`);
}

/**
 * Resume the paused draft from the inline commish dock. Mirror of
 * `pauseDraftFromLive` — redirects to the live page on success.
 */
export async function resumeDraftFromLive(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  if (!draftId) flash("error", "Missing draft id.");

  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    select: { status: true },
  });
  if (!draft) flash("error", "Draft not found.");
  if (draft.status !== "paused") {
    flash("error", `Can only resume a paused draft (currently ${draft.status}).`);
  }

  await prisma.draftRoom.update({
    where: { id: draftId },
    data: { status: "live" },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?msg=resumed`);
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

  // Find the next pick by "first pending" (not overallPick+1). This
  // handles shadow-manager pre-seeds, where a pick in the middle of the
  // grid is already status=locked at openDraft time. Skipping by raw
  // overallPick would hand the clock to an already-locked pick. We
  // have to exclude the current pick too — findNextPendingPick only
  // looks at status=pending, and we haven't yet transitioned `pick` to
  // status=locked when this query runs, but `pick` is status=onClock so
  // it's already excluded by the filter.
  const nextPick = await findNextPendingPick(prisma, pick.draftId);

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
