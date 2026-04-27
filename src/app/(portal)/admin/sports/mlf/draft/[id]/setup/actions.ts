"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Slot-assignment + draft config actions. Slot writes are idempotent
// upserts keyed on (draftId, slotOrder) so saving the same form twice
// doesn't duplicate rows.

const MAX_DISPLAY_NAME = 60;
const DISPLAY_NAME_PATTERN = /^[\w\s().'\-&]{1,60}$/;

function flash(path: string, key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${path}?${q}`);
}

/**
 * Create a "shadow manager" User — a lazyriverco user row with
 * `passwordHash=null` and `email=null`. Login simply fails for these
 * users (the password-check path rejects null hashes), which is
 * exactly the semantic we want: a shadow manager never logs in; the
 * commissioner shadow-manages their slot.
 *
 * Why not just inferred from passwordHash=null? We mark the DraftSlot
 * that uses this User as `isShadow=true` separately, so the "this
 * seat isn't staffed" semantic stays explicit. Future OAuth-only real
 * users might also have passwordHash=null; they'd still be `isShadow
 * =false` on their slots.
 */
export async function createShadowUser(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const displayName = String(fd.get("displayName") ?? "").trim();
  const base = draftId
    ? `/admin/sports/mlf/draft/${draftId}/setup`
    : "/admin/sports/mlf/draft";

  if (!displayName) flash(base, "error", "Shadow manager name required.");
  if (displayName.length > MAX_DISPLAY_NAME) {
    flash(base, "error", `Name too long (max ${MAX_DISPLAY_NAME} chars).`);
  }
  if (!DISPLAY_NAME_PATTERN.test(displayName)) {
    flash(base, "error", "Use letters, numbers, spaces, dashes, or parens only.");
  }

  // `User.name` is @unique; prefix with "shadow-" + UUID to avoid
  // collisions with real usernames. The displayName is what shows up in
  // dropdowns and captions.
  await prisma.user.create({
    data: {
      name: `shadow-${randomUUID()}`,
      displayName,
      role: "MEMBER",
      // passwordHash: null (default), email: null (default)
    },
  });

  revalidatePath(base);
  redirect(`${base}?msg=${encodeURIComponent(`Shadow manager "${displayName}" created.`)}`);
}

export async function saveSlots(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  if (!draftId) flash("/admin/sports/mlf/draft", "error", "Missing draft id.");
  const base = `/admin/sports/mlf/draft/${draftId}/setup`;

  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    select: { id: true, totalSlots: true, totalRounds: true, status: true },
  });
  if (!draft) flash("/admin/sports/mlf/draft", "error", "Draft not found.");

  if (draft.status === "live" || draft.status === "complete") {
    flash(base, "error", "Can't edit slots once draft is live. Pause first.");
  }

  // Gather assignments. Each slot row is slot_{i}_userId + slot_{i}_teamName
  // + slot_{i}_isShadow + slot_{i}_shadow_r{round}_playerId (shadow slots).
  type Assignment = {
    slotOrder: number;
    userId: string;
    teamName: string | null;
    isShadow: boolean;
    shadowPicks: Array<{ round: number; playerId: string }>;
  };
  const rows: Assignment[] = [];
  for (let i = 1; i <= draft.totalSlots; i++) {
    const userId = String(fd.get(`slot_${i}_userId`) ?? "").trim();
    const teamName = String(fd.get(`slot_${i}_teamName`) ?? "").trim() || null;
    const isShadow = String(fd.get(`slot_${i}_isShadow`) ?? "") === "on";
    if (!userId) continue;

    const shadowPicks: Array<{ round: number; playerId: string }> = [];
    if (isShadow) {
      for (let r = 1; r <= draft.totalRounds; r++) {
        const playerId = String(fd.get(`slot_${i}_shadow_r${r}_playerId`) ?? "").trim();
        if (playerId) {
          shadowPicks.push({ round: r, playerId });
        }
      }
    }

    rows.push({ slotOrder: i, userId, teamName, isShadow, shadowPicks });
  }

  // User can't occupy two slots — duplicate detection.
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.userId)) {
      flash(base, "error", "User assigned to multiple slots — each manager gets one seat.");
    }
    seen.add(r.userId);
  }

  // Upsert each. Cascade-delete covers the "unassigned" case: if a slot
  // is cleared, we nuke the existing row at that slotOrder. Shadow picks
  // for that slot cascade with it.
  const admin = await requireAdmin();
  for (let i = 1; i <= draft.totalSlots; i++) {
    const row = rows.find((rr) => rr.slotOrder === i);
    if (row) {
      const slot = await prisma.draftSlot.upsert({
        where: { draftId_slotOrder: { draftId, slotOrder: i } },
        create: {
          draftId,
          slotOrder: i,
          userId: row.userId,
          teamName: row.teamName,
          isShadow: row.isShadow,
        },
        update: {
          userId: row.userId,
          teamName: row.teamName,
          isShadow: row.isShadow,
        },
      });

      // Reconcile shadow picks for this slot: delete existing, then
      // insert the freshly submitted set. Shadow slots with no picks
      // just end up with nothing (openDraft will treat those rounds as
      // normal pending picks).
      await prisma.draftShadowPick.deleteMany({
        where: { draftId, slotId: slot.id },
      });
      if (row.isShadow && row.shadowPicks.length > 0) {
        await prisma.draftShadowPick.createMany({
          data: row.shadowPicks.map((sp) => ({
            draftId,
            slotId: slot.id,
            round: sp.round,
            playerId: sp.playerId,
            addedBy: admin.id,
          })),
        });
      }
    } else {
      // Clearing — delete any existing row at this slotOrder.
      await prisma.draftSlot
        .delete({ where: { draftId_slotOrder: { draftId, slotOrder: i } } })
        .catch(() => {
          // No-op: already absent. Shadow picks cascade with the slot.
        });
    }
  }

  revalidatePath(base);
  redirect(`${base}?msg=slots-saved`);
}
