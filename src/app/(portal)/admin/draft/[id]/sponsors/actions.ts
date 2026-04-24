"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function flash(path: string, key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${path}?${q}`);
}

export async function addSponsor(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  const tagline = String(fd.get("tagline") ?? "").trim() || null;
  const base = `/admin/draft/${draftId}/sponsors`;
  if (!draftId || !name) flash(base, "error", "Sponsor name required.");
  if (name.length > 80) flash(base, "error", "Name too long (max 80).");
  if (tagline && tagline.length > 200) flash(base, "error", "Tagline too long (max 200).");

  const last = await prisma.draftSponsor.findFirst({
    where: { draftId },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });

  await prisma.draftSponsor.create({
    data: {
      draftId,
      name,
      tagline,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
  });
  revalidatePath(base);
  redirect(`${base}?msg=added`);
}

export async function toggleSponsorActive(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const base = `/admin/draft/${draftId}/sponsors`;
  if (!id) flash(base, "error", "Missing sponsor id.");

  const cur = await prisma.draftSponsor.findUnique({
    where: { id },
    select: { active: true },
  });
  if (!cur) flash(base, "error", "Sponsor not found.");
  await prisma.draftSponsor.update({
    where: { id },
    data: { active: !cur.active },
  });
  revalidatePath(base);
  redirect(`${base}?msg=toggled`);
}

export async function deleteSponsor(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const base = `/admin/draft/${draftId}/sponsors`;
  if (!id) flash(base, "error", "Missing sponsor id.");
  await prisma.draftSponsor.delete({ where: { id } });
  revalidatePath(base);
  redirect(`${base}?msg=deleted`);
}

export async function reorderSponsor(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const direction = String(fd.get("direction") ?? "").trim();
  const base = `/admin/draft/${draftId}/sponsors`;
  if (!id || (direction !== "up" && direction !== "down")) {
    flash(base, "error", "Bad reorder request.");
  }

  const cur = await prisma.draftSponsor.findUnique({
    where: { id },
    select: { id: true, displayOrder: true, draftId: true },
  });
  if (!cur) flash(base, "error", "Sponsor not found.");

  const neighbor = await prisma.draftSponsor.findFirst({
    where: {
      draftId: cur.draftId,
      displayOrder: direction === "up"
        ? { lt: cur.displayOrder }
        : { gt: cur.displayOrder },
    },
    orderBy: { displayOrder: direction === "up" ? "desc" : "asc" },
    select: { id: true, displayOrder: true },
  });
  if (!neighbor) {
    // Already at edge; no-op.
    redirect(base);
  }

  // Swap via transaction.
  await prisma.$transaction([
    prisma.draftSponsor.update({
      where: { id: cur.id },
      data: { displayOrder: neighbor.displayOrder },
    }),
    prisma.draftSponsor.update({
      where: { id: neighbor.id },
      data: { displayOrder: cur.displayOrder },
    }),
  ]);

  revalidatePath(base);
  redirect(`${base}?msg=reordered`);
}
