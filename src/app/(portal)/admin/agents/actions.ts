"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// 16k chars ≈ 4k tokens — plenty of headroom for even the richest
// persona bible. Character.systemPrompt is @db.Text so the cap is
// purely editorial; raise further if a future prompt needs it.
const MAX_PROMPT_LENGTH = 16000;

// useFormState-compatible result shape. Same shape as
// src/app/(portal)/admin/gallery/actions.ts so the pattern is uniform
// across admin surfaces. Clients bind with
// `useFormState(action, null)` and render the returned { ok, error }.
export type AgentFormState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function createAgent(
  _prev: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  try {
    await requireAdmin();

    const rawName = formData.get("name");
    const displayName = formData.get("displayName");
    const systemPrompt = formData.get("systemPrompt");
    const active = formData.get("active");

    if (typeof rawName !== "string" || !rawName.trim()) {
      return { ok: false, error: "Slug (@handle) is required." };
    }
    const name = rawName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!name) {
      return { ok: false, error: "Slug must contain at least one letter or digit." };
    }
    if (typeof displayName !== "string" || !displayName.trim()) {
      return { ok: false, error: "Display name is required." };
    }
    if (typeof systemPrompt !== "string" || !systemPrompt.trim()) {
      return { ok: false, error: "System prompt is required." };
    }
    if (systemPrompt.length > MAX_PROMPT_LENGTH) {
      return {
        ok: false,
        error: `System prompt too long (${systemPrompt.length} / ${MAX_PROMPT_LENGTH} chars).`,
      };
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
    return { ok: true, message: `Created @${name}.` };
  } catch (e) {
    // Prisma P2002 on name unique — surface the real message instead of
    // letting Next digest-anonymize it.
    const msg =
      e instanceof Error ? e.message : "Unknown error creating agent.";
    return { ok: false, error: msg };
  }
}

export async function updateAgent(
  _prev: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  try {
    await requireAdmin();

    const id = formData.get("id");
    const displayName = formData.get("displayName");
    const systemPrompt = formData.get("systemPrompt");
    const active = formData.get("active");

    if (typeof id !== "string" || !id) {
      return { ok: false, error: "Missing agent id." };
    }
    if (typeof displayName !== "string" || !displayName.trim()) {
      return { ok: false, error: "Display name is required." };
    }
    if (typeof systemPrompt !== "string" || !systemPrompt.trim()) {
      return { ok: false, error: "System prompt is required." };
    }
    if (systemPrompt.length > MAX_PROMPT_LENGTH) {
      return {
        ok: false,
        error: `System prompt too long (${systemPrompt.length} / ${MAX_PROMPT_LENGTH} chars).`,
      };
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
    return { ok: true, message: `Saved ${displayName.trim()}.` };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Unknown error updating agent.";
    return { ok: false, error: msg };
  }
}
