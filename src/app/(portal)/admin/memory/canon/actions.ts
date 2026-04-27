"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MAX_CANON_LENGTH = 32_000;

/**
 * Update the single ClubhouseCanon row (name='default'). Single-row
 * convention — the migration seeded an empty row at install time so
 * findFirst never returns null.
 */
export async function updateCanon(formData: FormData): Promise<void> {
  await requireAdmin();

  const contentRaw = formData.get("content");
  const content =
    typeof contentRaw === "string" ? contentRaw : "";

  if (content.length > MAX_CANON_LENGTH) {
    throw new Error(`Canon too long (max ${MAX_CANON_LENGTH} chars)`);
  }

  await prisma.clubhouseCanon.update({
    where: { name: "default" },
    data: { content },
  });

  revalidatePath("/admin/memory/canon");
}
