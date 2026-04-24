"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { computeSnakeOrder } from "@/lib/draft";

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
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  if (!draftId) flash("/admin/draft", "error", "Missing draft id.");
  const base = `/admin/draft/${draftId}`;

  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    include: {
      slots: { select: { id: true, slotOrder: true, userId: true } },
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

  await prisma.$transaction([
    ...order.map((entry) => {
      const slot = slotByOrder.get(entry.slotOrder);
      if (!slot) {
        throw new Error(`Missing slot for slotOrder ${entry.slotOrder}`);
      }
      const isFirst = entry.overallPick === 1;
      return prisma.draftPick.create({
        data: {
          draftId,
          round: entry.round,
          pickInRound: entry.pickInRound,
          overallPick: entry.overallPick,
          slotId: slot.id,
          userId: slot.userId,
          status: isFirst ? "onClock" : "pending",
          onClockAt: isFirst ? now : null,
        },
      });
    }),
    prisma.draftRoom.update({
      where: { id: draftId },
      data: { status: "live", openedAt: now },
    }),
  ]);

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
