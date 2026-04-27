"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  DEFAULT_AGENT_MODEL,
  isValidAgentModel,
  type AgentModelId,
} from "@/lib/agent-models";

// 16k chars ≈ 4k tokens — plenty of headroom for even the richest
// persona bible. Character.systemPrompt is @db.Text so the cap is
// purely editorial; raise further if a future prompt needs it.
const MAX_PROMPT_LENGTH = 16000;

/** Coerce the `model` form field to a valid AgentModelId, falling back
 *  to the default. The form always sends a value from the dropdown, but
 *  defense in depth: a hand-crafted POST with a bogus value lands on
 *  the default instead of writing a row that the stream route will have
 *  to resolve back at read time. */
function parseAgentModel(raw: unknown): AgentModelId {
  if (typeof raw === "string" && isValidAgentModel(raw)) return raw;
  return DEFAULT_AGENT_MODEL;
}

// Defense in depth: even though admins are trusted, clamp avatarUrl to a
// canonical shape produced by /api/avatars/presign. This rejects any URL
// not under our R2 public base, and rejects paths that could backtrack
// out of the avatars/ prefix. Matches newAvatarKey()'s output in
// src/lib/r2.ts — UUID key with a jpg/png/webp/gif extension.
type ParsedAvatar =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

function parseAvatarUrl(raw: unknown): ParsedAvatar {
  if (typeof raw !== "string" || raw === "") return { ok: true, value: null };
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!publicBase) {
    return { ok: false, error: "Avatar uploads not configured (missing R2 public base)." };
  }
  const base = publicBase.replace(/\/+$/, "");
  const pattern = new RegExp(
    `^${escapeForRegex(base)}/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp|gif)$`,
    "i",
  );
  if (!pattern.test(raw)) {
    return { ok: false, error: "Avatar URL rejected — must come from the uploader." };
  }
  return { ok: true, value: raw };
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// useFormState-compatible result shape. Same shape as
// src/app/(portal)/admin/library/actions.ts so the pattern is uniform
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
    const rawAvatarUrl = formData.get("avatarUrl");

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

    const avatarParsed = parseAvatarUrl(rawAvatarUrl);
    if (!avatarParsed.ok) {
      return { ok: false, error: avatarParsed.error };
    }

    const dialogueMode = formData.get("dialogueMode") === "on";
    const model = parseAgentModel(formData.get("model"));

    // Append at the end. Without this, the schema default of 0 would push
    // new rows above the existing ones (backfilled starting at 10).
    const maxRow = await prisma.character.aggregate({
      _max: { displayOrder: true },
    });
    const nextOrder = (maxRow._max.displayOrder ?? 0) + 10;

    await prisma.character.create({
      data: {
        name,
        displayName: displayName.trim(),
        systemPrompt: systemPrompt.trim(),
        active: active === "on",
        avatarUrl: avatarParsed.value,
        triggerKeywords: [],
        activeModules: ["chat"],
        dialogueMode,
        model,
        displayOrder: nextOrder,
      },
    });

    revalidatePath("/admin/ai/personas");
    return { ok: true, message: `Created @${name}.` };
  } catch (e) {
    // Prisma P2002 on name unique — surface the real message instead of
    // letting Next digest-anonymize it.
    const msg =
      e instanceof Error ? e.message : "Unknown error creating agent.";
    return { ok: false, error: msg };
  }
}

/** Move an agent up or down one slot. Reads the full ordered list,
 *  swaps in JS, then re-stamps every row's displayOrder in one
 *  Serializable transaction — simpler than swapping two rows in place
 *  and immune to ties or concurrent-admin races (Postgres aborts the
 *  loser, who refreshes). Cheap at ≤20 agents. */
export async function reorderAgent(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || !id) return;
  if (direction !== "up" && direction !== "down") return;

  await prisma.$transaction(
    async (tx) => {
      const all = await tx.character.findMany({
        orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
        select: { id: true },
      });

      const idx = all.findIndex((c) => c.id === id);
      if (idx === -1) return;

      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= all.length) return;

      const reordered = all.slice();
      [reordered[idx], reordered[swapWith]] = [reordered[swapWith]!, reordered[idx]!];

      await Promise.all(
        reordered.map((c, i) =>
          tx.character.update({
            where: { id: c.id },
            data: { displayOrder: (i + 1) * 10 },
          }),
        ),
      );
    },
    { isolationLevel: "Serializable" },
  );

  revalidatePath("/admin/ai/personas");
}

/** Flip the single isDefault row to a new agent. Clear-then-set in one
 *  transaction so the partial-unique index `Character_isDefault_key`
 *  (only one row may have isDefault=true) never sees two true rows. */
export async function setDefaultAgent(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  await prisma.$transaction([
    prisma.character.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    }),
    prisma.character.update({
      where: { id },
      data: { isDefault: true },
    }),
  ]);

  revalidatePath("/admin/ai/personas");
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
    const rawAvatarUrl = formData.get("avatarUrl");

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

    const avatarParsed = parseAvatarUrl(rawAvatarUrl);
    if (!avatarParsed.ok) {
      return { ok: false, error: avatarParsed.error };
    }

    const dialogueMode = formData.get("dialogueMode") === "on";
    const model = parseAgentModel(formData.get("model"));

    await prisma.character.update({
      where: { id },
      data: {
        displayName: displayName.trim(),
        systemPrompt: systemPrompt.trim(),
        active: active === "on",
        avatarUrl: avatarParsed.value,
        dialogueMode,
        model,
      },
    });

    revalidatePath("/admin/ai/personas");
    return { ok: true, message: `Saved ${displayName.trim()}.` };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Unknown error updating agent.";
    return { ok: false, error: msg };
  }
}
