"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// 16k chars ≈ 4k tokens — plenty of headroom for even the richest
// persona bible (Barfdog was the tightest at ~7k when this cap was
// 8k and started to trip). Character.systemPrompt is @db.Text so the
// cap is purely editorial; raise further if a future prompt needs it.
// Follow-up for DX: convert these actions to return { ok, error } via
// React 19 useActionState so validation failures show the real
// message instead of Next's anonymized digest in production.
const MAX_PROMPT_LENGTH = 16000;

/**
 * Update an agent's display name, system prompt, and active state.
 * Server-action gated by requireAdmin so only commissioners can call it.
 *
 * Returns void (Promise<void>) so it can be used directly as a
 * `<form action={...}>` handler. Throws on validation failure — Next.js
 * surfaces the message via the default error boundary.
 */
export async function createAgent(formData: FormData): Promise<void> {
  await requireAdmin();

  const rawName = formData.get("name");
  const displayName = formData.get("displayName");
  const systemPrompt = formData.get("systemPrompt");
  const active = formData.get("active");

  if (typeof rawName !== "string" || !rawName.trim()) {
    throw new Error("Slug (@handle) is required");
  }
  const name = rawName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!name) {
    throw new Error("Slug must contain at least one letter or digit");
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new Error("Display name is required");
  }
  if (typeof systemPrompt !== "string" || !systemPrompt.trim()) {
    throw new Error("System prompt is required");
  }
  if (systemPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`System prompt too long (max ${MAX_PROMPT_LENGTH} chars)`);
  }

  await prisma.character.create({
    data: {
      name,
      displayName: displayName.trim(),
      systemPrompt: systemPrompt.trim(),
      active: active === "on",
      triggerKeywords: [],
      activeModules: ["chat"],
    },
  });

  revalidatePath("/admin/agents");
}

export async function updateAgent(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  const displayName = formData.get("displayName");
  const systemPrompt = formData.get("systemPrompt");
  const active = formData.get("active");

  if (typeof id !== "string" || !id) {
    throw new Error("Missing agent id");
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new Error("Display name is required");
  }
  if (typeof systemPrompt !== "string" || !systemPrompt.trim()) {
    throw new Error("System prompt is required");
  }
  if (systemPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`System prompt too long (max ${MAX_PROMPT_LENGTH} chars)`);
  }

  await prisma.character.update({
    where: { id },
    data: {
      displayName: displayName.trim(),
      systemPrompt: systemPrompt.trim(),
      active: active === "on",
    },
  });

  revalidatePath("/admin/agents");
}
