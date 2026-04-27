"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MAX_NAME = 80;
const MAX_TAGLINE = 140;
const MAX_URL = 2048;

export async function createSponsor(fd: FormData): Promise<void> {
  await requireAdmin();

  const name = readField(fd, "name", MAX_NAME);
  const tagline = readOptional(fd, "tagline", MAX_TAGLINE);
  const href = readOptional(fd, "href", MAX_URL);
  const displayOrderRaw = Number(fd.get("displayOrder") ?? 0);
  const active = fd.get("active") === "on";

  if (!name) return back({ error: "Sponsor name is required." });
  if (href && !/^https?:\/\/.+/i.test(href)) {
    return back({ error: "Click-through URL must start with http:// or https://" });
  }

  await prisma.sportsSponsor.create({
    data: {
      name,
      tagline,
      href,
      active,
      displayOrder: Number.isFinite(displayOrderRaw) ? Math.trunc(displayOrderRaw) : 0,
    },
  });
  revalidatePath("/admin/sports/sponsors");
  return back({ msg: `Added ${name}.` });
}

export async function updateSponsor(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing sponsor id." });

  const name = readField(fd, "name", MAX_NAME);
  const tagline = readOptional(fd, "tagline", MAX_TAGLINE);
  const href = readOptional(fd, "href", MAX_URL);
  const displayOrderRaw = Number(fd.get("displayOrder") ?? 0);
  const active = fd.get("active") === "on";

  if (!name) return back({ error: "Sponsor name is required." });
  if (href && !/^https?:\/\/.+/i.test(href)) {
    return back({ error: "Click-through URL must start with http:// or https://" });
  }

  await prisma.sportsSponsor.update({
    where: { id },
    data: {
      name,
      tagline,
      href,
      active,
      displayOrder: Number.isFinite(displayOrderRaw) ? Math.trunc(displayOrderRaw) : 0,
    },
  });
  revalidatePath("/admin/sports/sponsors");
  return back({ msg: `Updated ${name}.` });
}

export async function toggleSponsorActive(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing sponsor id." });

  const s = await prisma.sportsSponsor.findUnique({
    where: { id },
    select: { active: true, name: true },
  });
  if (!s) return back({ error: "Sponsor not found." });

  await prisma.sportsSponsor.update({
    where: { id },
    data: { active: !s.active },
  });
  revalidatePath("/admin/sports/sponsors");
  return back({
    msg: s.active ? `${s.name} paused.` : `${s.name} active.`,
  });
}

export async function deleteSponsor(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing sponsor id." });

  try {
    await prisma.sportsSponsor.delete({ where: { id } });
  } catch (e) {
    console.error("deleteSponsor failed", e);
    return back({ error: "Couldn't delete the sponsor." });
  }
  revalidatePath("/admin/sports/sponsors");
  return back({ msg: "Sponsor deleted." });
}

function readField(fd: FormData, key: string, max: number): string {
  return (fd.get(key) ?? "").toString().trim().slice(0, max);
}

function readOptional(fd: FormData, key: string, max: number): string | null {
  const v = readField(fd, key, max);
  return v.length > 0 ? v : null;
}

function back(flash: { msg?: string; error?: string }): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  const qs = params.toString();
  redirect(qs ? `/admin/sports/sponsors?${qs}` : "/admin/sports/sponsors");
}
