"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { SportTag } from "@prisma/client";

// Admin actions for /admin/sports/wags — CRUD on SportsWag, the
// curated cross-sport partner roster surfaced on /sports as the WAG
// of the Day. Mirrors the shape of /admin/memory/feeds/actions.ts:
// requireAdmin → validate → prisma write → revalidatePath → flash
// redirect. Plain `<form action>` invocations, no client component.

const MAX_NAME = 120;
const MAX_ATHLETE = 120;
const MAX_TEAM = 80;
const MAX_URL = 2048;
const MAX_HANDLE = 80;
const MAX_CAPTION = 280;
const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const satisfies readonly SportTag[];

// ---------------------------------------------------------------------------

export async function createWag(fd: FormData): Promise<void> {
  await requireAdmin();

  const name = readField(fd, "name", MAX_NAME);
  const athleteName = readField(fd, "athleteName", MAX_ATHLETE);
  const sportRaw = (fd.get("sport") ?? "").toString();
  const team = readOptionalField(fd, "team", MAX_TEAM);
  const imageUrl = readField(fd, "imageUrl", MAX_URL);
  const instagramUrl = readOptionalField(fd, "instagramUrl", MAX_HANDLE);
  const caption = readOptionalField(fd, "caption", MAX_CAPTION);

  if (!name) return back({ error: "Partner name is required." });
  if (!athleteName) return back({ error: "Athlete name is required." });
  if (!SPORTS.includes(sportRaw as SportTag)) {
    return back({ error: "Sport must be one of NFL/NBA/MLB/NHL/MLS/UFC." });
  }
  if (!imageUrl || !/^https?:\/\/.+/i.test(imageUrl)) {
    return back({ error: "Image URL must start with http:// or https://" });
  }

  try {
    await prisma.sportsWag.create({
      data: {
        name,
        athleteName,
        sport: sportRaw as SportTag,
        team,
        imageUrl,
        instagramUrl,
        caption,
      },
    });
  } catch (e) {
    console.error("createWag failed", e);
    return back({ error: "Couldn't save the WAG." });
  }

  revalidatePath("/admin/sports/wags");
  revalidatePath("/admin/sports/wags/queue");
  return back({ msg: `Added ${name}.` });
}

// ---------------------------------------------------------------------------

export async function updateWag(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing WAG id." });

  const name = readField(fd, "name", MAX_NAME);
  const athleteName = readField(fd, "athleteName", MAX_ATHLETE);
  const sportRaw = (fd.get("sport") ?? "").toString();
  const team = readOptionalField(fd, "team", MAX_TEAM);
  const imageUrl = readField(fd, "imageUrl", MAX_URL);
  const instagramUrl = readOptionalField(fd, "instagramUrl", MAX_HANDLE);
  const caption = readOptionalField(fd, "caption", MAX_CAPTION);

  if (!name) return back({ error: "Partner name is required." });
  if (!athleteName) return back({ error: "Athlete name is required." });
  if (!SPORTS.includes(sportRaw as SportTag)) {
    return back({ error: "Sport must be one of NFL/NBA/MLB/NHL/MLS/UFC." });
  }
  if (!imageUrl || !/^https?:\/\/.+/i.test(imageUrl)) {
    return back({ error: "Image URL must start with http:// or https://" });
  }

  try {
    await prisma.sportsWag.update({
      where: { id },
      data: {
        name,
        athleteName,
        sport: sportRaw as SportTag,
        team,
        imageUrl,
        instagramUrl,
        caption,
      },
    });
  } catch (e) {
    console.error("updateWag failed", e);
    return back({ error: "Couldn't update the WAG." });
  }

  revalidatePath("/admin/sports/wags");
  revalidatePath("/admin/sports/wags/queue");
  return back({ msg: `Updated ${name}.` });
}

// ---------------------------------------------------------------------------

export async function toggleWagHidden(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing WAG id." });

  const wag = await prisma.sportsWag.findUnique({
    where: { id },
    select: { hidden: true, name: true },
  });
  if (!wag) return back({ error: "WAG not found." });

  await prisma.sportsWag.update({
    where: { id },
    data: { hidden: !wag.hidden },
  });
  revalidatePath("/admin/sports/wags");
  revalidatePath("/admin/sports/wags/queue");
  return back({ msg: wag.hidden ? `${wag.name} unhidden.` : `${wag.name} hidden.` });
}

// ---------------------------------------------------------------------------

export async function deleteWag(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing WAG id." });

  try {
    // SportsWagFeature rows referencing this WAG cascade-delete per
    // the schema's onDelete: Cascade.
    await prisma.sportsWag.delete({ where: { id } });
  } catch (e) {
    console.error("deleteWag failed", e);
    return back({ error: "Couldn't delete the WAG." });
  }
  revalidatePath("/admin/sports/wags");
  revalidatePath("/admin/sports/wags/queue");
  return back({ msg: "WAG deleted." });
}

// ---------------------------------------------------------------------------

function readField(fd: FormData, key: string, max: number): string {
  return (fd.get(key) ?? "").toString().trim().slice(0, max);
}

function readOptionalField(
  fd: FormData,
  key: string,
  max: number,
): string | null {
  const v = readField(fd, key, max);
  return v.length > 0 ? v : null;
}

function back(flash: { msg?: string; error?: string }): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  const qs = params.toString();
  redirect(qs ? `/admin/sports/wags?${qs}` : "/admin/sports/wags");
}
