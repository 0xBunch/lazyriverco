"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MAX_CONTENT_LENGTH = 8000;

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

export async function createLore(formData: FormData): Promise<void> {
  await requireAdmin();

  const topic = formData.get("topic");
  const tagsRaw = formData.get("tags");
  const content = formData.get("content");
  const isCore = formData.get("isCore");
  const sortOrder = formData.get("sortOrder");

  if (typeof topic !== "string" || !topic.trim()) throw new Error("Topic is required");
  if (typeof content !== "string" || !content.trim()) throw new Error("Content is required");
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(`Content too long (max ${MAX_CONTENT_LENGTH})`);

  await prisma.lore.create({
    data: {
      topic: topic.trim(),
      tags: parseTags(typeof tagsRaw === "string" ? tagsRaw : ""),
      content: content.trim(),
      isCore: isCore === "on",
      sortOrder: sortOrder ? parseInt(String(sortOrder), 10) || 0 : 0,
    },
  });

  revalidatePath("/admin/lore");
}

export async function updateLore(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  const topic = formData.get("topic");
  const tagsRaw = formData.get("tags");
  const content = formData.get("content");
  const isCore = formData.get("isCore");
  const sortOrder = formData.get("sortOrder");

  if (typeof id !== "string" || !id) throw new Error("Missing lore id");
  if (typeof topic !== "string" || !topic.trim()) throw new Error("Topic is required");
  if (typeof content !== "string" || !content.trim()) throw new Error("Content is required");
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(`Content too long (max ${MAX_CONTENT_LENGTH})`);

  await prisma.lore.update({
    where: { id },
    data: {
      topic: topic.trim(),
      tags: parseTags(typeof tagsRaw === "string" ? tagsRaw : ""),
      content: content.trim(),
      isCore: isCore === "on",
      sortOrder: sortOrder ? parseInt(String(sortOrder), 10) || 0 : 0,
    },
  });

  revalidatePath("/admin/lore");
}

export async function deleteLore(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing lore id");

  await prisma.lore.delete({ where: { id } });

  revalidatePath("/admin/lore");
}
