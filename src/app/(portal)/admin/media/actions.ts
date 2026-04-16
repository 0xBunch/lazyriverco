"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

const VALID_TYPES = new Set([
  "image",
  "video",
  "youtube",
  "instagram",
  "tweet",
  "link",
]);

/**
 * Create an external media entry (YouTube, Instagram, tweet, article).
 * No R2 upload — the URL is stored directly. Status is set to READY
 * immediately since there's no upload lifecycle.
 */
export async function createExternalMedia(
  formData: FormData,
): Promise<void> {
  const user = await requireAdmin();

  const url = formData.get("url");
  const type = formData.get("type");
  const caption = formData.get("caption");
  const tagsRaw = formData.get("tags");

  if (typeof url !== "string" || !url.trim()) {
    throw new Error("URL is required");
  }
  if (typeof type !== "string" || !VALID_TYPES.has(type)) {
    throw new Error(`Invalid type. Must be one of: ${[...VALID_TYPES].join(", ")}`);
  }
  if (typeof caption !== "string") {
    throw new Error("Caption is required");
  }

  await prisma.media.create({
    data: {
      url: url.trim(),
      type,
      caption: caption.trim() || null,
      tags: parseTags(typeof tagsRaw === "string" ? tagsRaw : ""),
      status: "READY",
      uploadedById: user.id,
    },
  });

  revalidatePath("/admin/media");
}

export async function updateMedia(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  const caption = formData.get("caption");
  const tagsRaw = formData.get("tags");
  const hallOfFame = formData.get("hallOfFame");

  if (typeof id !== "string" || !id) throw new Error("Missing media id");

  await prisma.media.update({
    where: { id },
    data: {
      caption: typeof caption === "string" ? caption.trim() || null : undefined,
      tags: typeof tagsRaw === "string" ? parseTags(tagsRaw) : undefined,
      hallOfFame: hallOfFame === "on",
    },
  });

  revalidatePath("/admin/media");
}

export async function deleteMedia(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing media id");

  await prisma.media.update({
    where: { id },
    data: { status: "DELETED" },
  });

  revalidatePath("/admin/media");
}
