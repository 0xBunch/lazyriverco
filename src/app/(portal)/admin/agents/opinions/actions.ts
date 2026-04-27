"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MAX_RELATIONSHIP_LENGTH = 4000;

/**
 * Upsert one (agent, target user) relationship narrative. Empty content
 * deletes the row so we don't store noise. Server-action gated.
 */
export async function updateRelationship(formData: FormData): Promise<void> {
  await requireAdmin();

  const characterId = formData.get("characterId");
  const targetUserId = formData.get("targetUserId");
  const contentRaw = formData.get("content");

  if (typeof characterId !== "string" || !characterId) {
    throw new Error("Missing characterId");
  }
  if (typeof targetUserId !== "string" || !targetUserId) {
    throw new Error("Missing targetUserId");
  }

  const content =
    typeof contentRaw === "string" ? contentRaw.trim() : "";

  if (content.length > MAX_RELATIONSHIP_LENGTH) {
    throw new Error(
      `Relationship too long (max ${MAX_RELATIONSHIP_LENGTH} chars)`,
    );
  }

  if (content) {
    await prisma.agentRelationship.upsert({
      where: {
        characterId_targetUserId: { characterId, targetUserId },
      },
      update: { content },
      create: { characterId, targetUserId, content },
    });
  } else {
    // Clearing the textarea deletes the row — keeps the table clean.
    await prisma.agentRelationship
      .delete({
        where: {
          characterId_targetUserId: { characterId, targetUserId },
        },
      })
      .catch(() => {
        // Already absent — that's fine.
      });
  }

  revalidatePath("/admin/agents/opinions");
}
