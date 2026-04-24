"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Slot-assignment + draft config actions. Slot writes are idempotent
// upserts keyed on (draftId, slotOrder) so saving the same form twice
// doesn't duplicate rows. Status transitions live here too because
// setup is where "go live" happens.

function flash(path: string, key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${path}?${q}`);
}

export async function saveSlots(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  if (!draftId) flash("/admin/draft", "error", "Missing draft id.");
  const base = `/admin/draft/${draftId}/setup`;

  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    select: { id: true, totalSlots: true, status: true },
  });
  if (!draft) flash("/admin/draft", "error", "Draft not found.");

  if (draft.status === "live" || draft.status === "complete") {
    flash(base, "error", "Can't edit slots once draft is live. Pause first.");
  }

  // Gather assignments. Each slot row is slot_{i}_userId + slot_{i}_teamName.
  type Assignment = { slotOrder: number; userId: string; teamName: string | null };
  const rows: Assignment[] = [];
  for (let i = 1; i <= draft.totalSlots; i++) {
    const userId = String(fd.get(`slot_${i}_userId`) ?? "").trim();
    const teamName = String(fd.get(`slot_${i}_teamName`) ?? "").trim() || null;
    if (!userId) continue;
    rows.push({ slotOrder: i, userId, teamName });
  }

  // User can't occupy two slots — duplicate detection.
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.userId)) {
      flash(base, "error", `User assigned to multiple slots — each manager gets one seat.`);
    }
    seen.add(r.userId);
  }

  // Upsert each. Cascade-delete covers the "unassigned" case: if a slot is
  // cleared, we nuke the existing row at that slotOrder.
  for (let i = 1; i <= draft.totalSlots; i++) {
    const row = rows.find((r) => r.slotOrder === i);
    if (row) {
      await prisma.draftSlot.upsert({
        where: { draftId_slotOrder: { draftId, slotOrder: i } },
        create: {
          draftId,
          slotOrder: i,
          userId: row.userId,
          teamName: row.teamName,
        },
        update: {
          userId: row.userId,
          teamName: row.teamName,
        },
      });
    } else {
      // Clearing — delete any existing row at this slotOrder.
      await prisma.draftSlot
        .delete({ where: { draftId_slotOrder: { draftId, slotOrder: i } } })
        .catch(() => {
          // No-op: already absent.
        });
    }
  }

  revalidatePath(base);
  redirect(`${base}?msg=slots-saved`);
}
