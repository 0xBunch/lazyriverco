"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { computeSnakeOrder } from "@/lib/draft";
import { generateDraftPickReaction } from "@/lib/sleeper-ai";

function flash(path: string, key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${path}?${q}`);
}

/**
 * Flip a setup-state draft into live. This is where the 24-pick grid
 * materializes: computeSnakeOrder generates the full sequence, we write
 * every row in one transaction, and pick 1.01 starts on-clock so
 * polling clients immediately see an actionable state.
 *
 * Guardrails: all slots must be filled (1..totalSlots), pool must be
 * non-empty. Idempotency: if called twice on a live draft, we no-op
 * rather than duplicate picks.
 */
export async function openDraft(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  if (!draftId) flash("/admin/draft", "error", "Missing draft id.");
  const base = `/admin/draft/${draftId}`;

  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    include: {
      slots: { select: { id: true, slotOrder: true, userId: true, isShadow: true } },
      shadowPicks: {
        select: { slotId: true, round: true, playerId: true },
      },
      announcerImgs: {
        where: { consumedPickId: null },
        select: { id: true },
      },
      _count: { select: { pool: true, picks: true } },
    },
  });
  if (!draft) flash("/admin/draft", "error", "Draft not found.");
  if (draft.status !== "setup") {
    flash(base, "error", `Draft is already ${draft.status}.`);
  }
  if (draft.slots.length !== draft.totalSlots) {
    flash(base, "error", `Assign all ${draft.totalSlots} slots before opening.`);
  }
  if (draft._count.pool === 0) {
    flash(base, "error", "Seed the rookie pool before opening.");
  }
  if (draft._count.picks > 0) {
    flash(base, "error", "Picks already materialized — edit DB or reset draft.");
  }

  const order = computeSnakeOrder(draft.totalSlots, draft.totalRounds, draft.snake);
  const slotByOrder = new Map(draft.slots.map((s) => [s.slotOrder, s]));
  const now = new Date();

  // Index shadow pre-seeds by (slotId, round) so materialization can look
  // them up O(1). Maps an internal key to the pre-chosen playerId.
  const shadowByKey = new Map<string, string>();
  for (const sp of draft.shadowPicks) {
    shadowByKey.set(`${sp.slotId}:${sp.round}`, sp.playerId);
  }

  // Shuffle the unused announcer-image pool so shadow picks each get a
  // distinct image. We take at most one per shadow pick; any leftovers
  // stay eligible for live picks.
  const shuffledImages = [...draft.announcerImgs].sort(() => Math.random() - 0.5);
  let imageCursor = 0;

  // First pass: build the DraftPick create-statements, deciding per entry
  // whether it's a shadow pre-seed (→ status=locked + playerId + image
  // consumed) or a normal entry (→ status=pending).
  type Materialized = {
    overallPick: number;
    create: Parameters<typeof prisma.draftPick.create>[0];
    /** Set only when this pick should consume a specific announcer
     *  image during the same transaction. */
    consumeImageId: string | null;
    /** Set only when the shadow pre-seed should fire its reaction
     *  generator after the transaction commits. */
    fireReactionPickOverallPick: number | null;
  };

  const materialized: Materialized[] = order.map((entry) => {
    const slot = slotByOrder.get(entry.slotOrder);
    if (!slot) {
      throw new Error(`Missing slot for slotOrder ${entry.slotOrder}`);
    }
    const shadowPlayerId = shadowByKey.get(`${slot.id}:${entry.round}`);
    if (shadowPlayerId) {
      const img = imageCursor < shuffledImages.length ? shuffledImages[imageCursor++] : null;
      return {
        overallPick: entry.overallPick,
        create: {
          data: {
            draftId,
            round: entry.round,
            pickInRound: entry.pickInRound,
            overallPick: entry.overallPick,
            slotId: slot.id,
            userId: slot.userId,
            playerId: shadowPlayerId,
            status: "locked",
            lockedAt: now,
            lockedById: admin.id,
          },
        } as Parameters<typeof prisma.draftPick.create>[0],
        consumeImageId: img?.id ?? null,
        fireReactionPickOverallPick: entry.overallPick,
      };
    }
    return {
      overallPick: entry.overallPick,
      create: {
        data: {
          draftId,
          round: entry.round,
          pickInRound: entry.pickInRound,
          overallPick: entry.overallPick,
          slotId: slot.id,
          userId: slot.userId,
          status: "pending",
        },
      } as Parameters<typeof prisma.draftPick.create>[0],
      consumeImageId: null,
      fireReactionPickOverallPick: null,
    };
  });

  // First pending pick (by overallPick ascending) becomes the initial
  // on-clock. In a shadow-free draft this is overallPick=1; with shadows
  // at the front of the grid, it advances past them.
  const firstPendingOverall = materialized
    .filter((m) => m.create.data.status === "pending")
    .map((m) => m.overallPick)
    .sort((a, b) => a - b)[0];

  // Mutate the chosen pick's create-data in place to start as onClock.
  // (Still before the transaction runs — purely a local prep.)
  if (firstPendingOverall != null) {
    const target = materialized.find((m) => m.overallPick === firstPendingOverall);
    if (target) {
      (target.create.data as Record<string, unknown>).status = "onClock";
      (target.create.data as Record<string, unknown>).onClockAt = now;
    }
  }

  // Run the transaction: create every DraftPick (grid of pending +
  // pre-locked shadow picks), flip DraftRoom to live. Image binding
  // and reaction generation for shadow picks happens post-commit —
  // we need the created DraftPick IDs to bind announcer images
  // (consumedPickId FK) and we don't want any Claude call inside a
  // DB transaction.
  await prisma.$transaction([
    ...materialized.map((m) => prisma.draftPick.create(m.create)),
    prisma.draftRoom.update({
      where: { id: draftId },
      data: { status: "live", openedAt: now },
    }),
  ]);

  // Post-transaction: for each shadow pre-seed, resolve the created
  // DraftPick and (a) bind the reserved announcer image via consumed
  // PickId, (b) fire the reaction generator async.
  const shadowPreseeds = materialized.filter((m) => m.fireReactionPickOverallPick != null);
  for (const m of shadowPreseeds) {
    const created = await prisma.draftPick.findUnique({
      where: {
        draftId_overallPick: { draftId, overallPick: m.overallPick },
      },
      select: { id: true },
    });
    if (!created) continue;
    if (m.consumeImageId) {
      await prisma.draftAnnouncerImage
        .update({
          where: { id: m.consumeImageId },
          data: { consumedPickId: created.id },
        })
        .catch((err) => {
          console.warn(
            `[openDraft] failed to bind announcer image ${m.consumeImageId} to pick ${created.id}:`,
            err,
          );
        });
    }
    // Fire reaction async; same pattern as lockPick.
    void generateDraftPickReaction(created.id).catch((err) => {
      console.warn(
        `[openDraft] shadow-pick reaction failed for pick ${created.id}:`,
        err,
      );
    });
  }

  revalidatePath(base);
  revalidatePath(`/sports/mlf/draft-2026`);
  redirect(`${base}?msg=draft-opened`);
}

export async function pauseDraft(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const base = `/admin/draft/${draftId}`;
  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    select: { status: true },
  });
  if (!draft) flash(base, "error", "Draft not found.");
  if (draft.status !== "live") {
    flash(base, "error", `Can only pause a live draft (currently ${draft.status}).`);
  }
  await prisma.draftRoom.update({
    where: { id: draftId },
    data: { status: "paused" },
  });
  revalidatePath(base);
  revalidatePath(`/sports/mlf/draft-2026`);
  redirect(`${base}?msg=paused`);
}

export async function resumeDraft(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const base = `/admin/draft/${draftId}`;
  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    select: { status: true },
  });
  if (!draft) flash(base, "error", "Draft not found.");
  if (draft.status !== "paused") {
    flash(base, "error", `Can only resume a paused draft (currently ${draft.status}).`);
  }
  await prisma.draftRoom.update({
    where: { id: draftId },
    data: { status: "live" },
  });
  revalidatePath(base);
  revalidatePath(`/sports/mlf/draft-2026`);
  redirect(`${base}?msg=resumed`);
}

export async function completeDraft(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const base = `/admin/draft/${draftId}`;
  await prisma.draftRoom.update({
    where: { id: draftId },
    data: { status: "complete", closedAt: new Date() },
  });
  revalidatePath(base);
  revalidatePath(`/sports/mlf/draft-2026`);
  redirect(`${base}?msg=completed`);
}
