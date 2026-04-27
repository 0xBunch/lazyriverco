"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { seedRookiePool } from "@/lib/draft";

function flash(path: string, key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${path}?${q}`);
}

export async function seedPool(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  if (!draftId) flash("/admin/sports/mlf/draft", "error", "Missing draft id.");
  const base = `/admin/sports/mlf/draft/${draftId}/pool`;

  const draft = await prisma.draftRoom.findUnique({
    where: { id: draftId },
    select: { id: true, status: true },
  });
  if (!draft) flash("/admin/sports/mlf/draft", "error", "Draft not found.");
  if (draft.status === "live" || draft.status === "complete") {
    flash(base, "error", "Can't seed pool while draft is live or complete.");
  }

  const result = await seedRookiePool(prisma, draftId, admin.id);
  revalidatePath(base);
  const { matched, inserted, breakdown } = result;
  const msg =
    `Seeded ${matched} matched rookies · ${inserted} new rows ` +
    `(by draftYear=${breakdown.byDraftYear} · by yearsExp=${breakdown.byYearsExp} · ` +
    `with team=${breakdown.withTeam} · no team=${breakdown.withoutTeam})`;
  redirect(`${base}?msg=${encodeURIComponent(msg)}`);
}

export async function addPlayerToPool(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const playerId = String(fd.get("playerId") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim() || null;
  if (!draftId) flash("/admin/sports/mlf/draft", "error", "Missing draft id.");
  const base = `/admin/sports/mlf/draft/${draftId}/pool`;
  if (!playerId) flash(base, "error", "Pick a player from the dropdown.");

  try {
    await prisma.draftPoolPlayer.upsert({
      where: { draftId_playerId: { draftId, playerId } },
      create: { draftId, playerId, addedBy: admin.id, note },
      update: { removed: false, note, addedBy: admin.id },
    });
  } catch {
    flash(base, "error", "Couldn't add player — double-check the ID.");
  }

  revalidatePath(base);
  redirect(`${base}?msg=player-added`);
}

export async function togglePlayerRemoved(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const id = String(fd.get("id") ?? "").trim();
  const removed = String(fd.get("removed") ?? "") === "true";
  const base = `/admin/sports/mlf/draft/${draftId}/pool`;
  if (!id) flash(base, "error", "Missing row id.");

  await prisma.draftPoolPlayer.update({
    where: { id },
    data: { removed: !removed },
  });
  revalidatePath(base);
  redirect(`${base}?msg=${removed ? "restored" : "removed"}`);
}
