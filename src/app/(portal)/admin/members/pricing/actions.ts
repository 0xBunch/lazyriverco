"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Admin API for /admin/members/pricing — ModelPricing CRUD. The
// LLMUsageEvent ledger at /admin/members/usage stays read-only and is
// populated by the wrappers in src/lib/usage.ts. Past events are locked
// to the rate in effect at their time of recording, so a rate edit
// only affects *future* calls.
//
// All actions are useFormState-compatible: (prevState, formData) => State.

export type AdminUsageState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

const MAX_MODEL_CHARS = 80;
const MAX_PROVIDER_CHARS = 40;
const MAX_NOTES_CHARS = 500;

function revalidateSurfaces(): void {
  revalidatePath("/admin/members/pricing");
}

function parseRate(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseOptionalRate(
  raw: FormDataEntryValue | null,
): { ok: true; value: number | null } | { ok: false } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: true, value: null };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

function parseString(
  raw: FormDataEntryValue | null,
  cap: number,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, cap);
}

// ---------------------------------------------------------------------------
// updateModelPricing — edit rates on an existing row. Past LLMUsageEvent
// rows retain their original estimatedCostUsd (locked at write time);
// only new events pick up the new rate.

export async function updateModelPricing(
  _prev: AdminUsageState,
  fd: FormData,
): Promise<AdminUsageState> {
  try {
    await requireAdmin();

    const id = parseString(fd.get("id"), 100);
    if (!id) return { ok: false, error: "Missing pricing id." };

    const existing = await prisma.modelPricing.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Pricing row not found." };

    const inputRate = parseRate(fd.get("inputPerMTokUsd"));
    const outputRate = parseRate(fd.get("outputPerMTokUsd"));
    if (inputRate === null) {
      return {
        ok: false,
        error: "Input rate must be a non-negative number.",
      };
    }
    if (outputRate === null) {
      return {
        ok: false,
        error: "Output rate must be a non-negative number.",
      };
    }

    const cacheRead = parseOptionalRate(fd.get("cacheReadPerMTokUsd"));
    if (!cacheRead.ok) {
      return { ok: false, error: "Cache read rate must be a number or blank." };
    }
    const cacheWrite = parseOptionalRate(fd.get("cacheWritePerMTokUsd"));
    if (!cacheWrite.ok) {
      return {
        ok: false,
        error: "Cache write rate must be a number or blank.",
      };
    }
    const perImage = parseOptionalRate(fd.get("perImageUsd"));
    if (!perImage.ok) {
      return { ok: false, error: "Per-image rate must be a number or blank." };
    }

    const notes = parseString(fd.get("notes"), MAX_NOTES_CHARS);

    await prisma.modelPricing.update({
      where: { id },
      data: {
        inputPerMTokUsd: inputRate,
        outputPerMTokUsd: outputRate,
        cacheReadPerMTokUsd: cacheRead.value,
        cacheWritePerMTokUsd: cacheWrite.value,
        perImageUsd: perImage.value,
        notes,
      },
    });

    revalidateSurfaces();
    return { ok: true, message: `Updated ${existing.model} rates.` };
  } catch (e) {
    console.error("updateModelPricing failed", e);
    return { ok: false, error: "Update failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// createModelPricing — add a brand-new provider/model row. Used when
// onboarding a new model (e.g. Opus, a new Gemini build). Rejects
// duplicates on the @unique model column.

export async function createModelPricing(
  _prev: AdminUsageState,
  fd: FormData,
): Promise<AdminUsageState> {
  try {
    await requireAdmin();

    const provider = parseString(fd.get("provider"), MAX_PROVIDER_CHARS);
    const model = parseString(fd.get("model"), MAX_MODEL_CHARS);
    if (!provider) return { ok: false, error: "Provider is required." };
    if (!model) return { ok: false, error: "Model is required." };

    const existing = await prisma.modelPricing.findUnique({ where: { model } });
    if (existing) {
      return { ok: false, error: `Model "${model}" already exists.` };
    }

    const inputRate = parseRate(fd.get("inputPerMTokUsd"));
    const outputRate = parseRate(fd.get("outputPerMTokUsd"));
    if (inputRate === null) {
      return {
        ok: false,
        error: "Input rate must be a non-negative number.",
      };
    }
    if (outputRate === null) {
      return {
        ok: false,
        error: "Output rate must be a non-negative number.",
      };
    }

    const cacheRead = parseOptionalRate(fd.get("cacheReadPerMTokUsd"));
    if (!cacheRead.ok) {
      return { ok: false, error: "Cache read rate must be a number or blank." };
    }
    const cacheWrite = parseOptionalRate(fd.get("cacheWritePerMTokUsd"));
    if (!cacheWrite.ok) {
      return {
        ok: false,
        error: "Cache write rate must be a number or blank.",
      };
    }
    const perImage = parseOptionalRate(fd.get("perImageUsd"));
    if (!perImage.ok) {
      return { ok: false, error: "Per-image rate must be a number or blank." };
    }

    const notes = parseString(fd.get("notes"), MAX_NOTES_CHARS);

    await prisma.modelPricing.create({
      data: {
        provider,
        model,
        inputPerMTokUsd: inputRate,
        outputPerMTokUsd: outputRate,
        cacheReadPerMTokUsd: cacheRead.value,
        cacheWritePerMTokUsd: cacheWrite.value,
        perImageUsd: perImage.value,
        notes,
      },
    });

    revalidateSurfaces();
    return { ok: true, message: `Added ${model}.` };
  } catch (e) {
    console.error("createModelPricing failed", e);
    return { ok: false, error: "Add failed — try again." };
  }
}
