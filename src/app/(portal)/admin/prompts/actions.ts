"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Admin API for /admin/prompts. Manages PromptGroup rows (the dropdown
// buttons beneath the homepage prompt box) and their PromptSuggestion
// items (the short-label + full-prompt entries inside each menu).
//
// All actions are useFormState-compatible: (prevState, formData) => State.
// Each action re-validates the homepage so changes appear without a
// hard refresh.

export type AdminPromptsState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

const MAX_GROUP_LABEL = 40;
const MAX_ITEM_LABEL = 60;
const MAX_PROMPT_CHARS = 2000;

function revalidateSurfaces(): void {
  revalidatePath("/admin/prompts");
  revalidatePath("/");
}

function normalizeString(
  raw: FormDataEntryValue | null,
  cap: number,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, cap);
}

function normalizeMultiline(
  raw: FormDataEntryValue | null,
  cap: number,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, cap);
}

function parseId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function parseDirection(raw: FormDataEntryValue | null): "up" | "down" | null {
  return raw === "up" || raw === "down" ? raw : null;
}

// ---------------------------------------------------------------------------
// Group actions

export async function createGroupAction(
  _prev: AdminPromptsState,
  fd: FormData,
): Promise<AdminPromptsState> {
  try {
    await requireAdmin();
    const label = normalizeString(fd.get("label"), MAX_GROUP_LABEL);
    if (!label) {
      return { ok: false, error: "Label is required." };
    }
    const max = await prisma.promptGroup.aggregate({
      _max: { sortOrder: true },
    });
    const nextOrder = (max._max.sortOrder ?? -1) + 1;
    await prisma.promptGroup.create({
      data: { label, sortOrder: nextOrder },
    });
    revalidateSurfaces();
    return { ok: true, message: `Added group "${label}".` };
  } catch (e) {
    console.error("createGroupAction failed", e);
    return { ok: false, error: "Create failed — try again." };
  }
}

export async function updateGroupAction(
  _prev: AdminPromptsState,
  fd: FormData,
): Promise<AdminPromptsState> {
  try {
    await requireAdmin();
    const groupId = parseId(fd.get("groupId"));
    if (!groupId) return { ok: false, error: "Missing group id." };
    const label = normalizeString(fd.get("label"), MAX_GROUP_LABEL);
    if (!label) return { ok: false, error: "Label is required." };
    const isActive = fd.get("isActive") === "on";

    const result = await prisma.promptGroup.updateMany({
      where: { id: groupId },
      data: { label, isActive },
    });
    if (result.count === 0) {
      return { ok: false, error: "Group not found." };
    }
    revalidateSurfaces();
    return { ok: true, message: `Updated "${label}".` };
  } catch (e) {
    console.error("updateGroupAction failed", e);
    return { ok: false, error: "Update failed — try again." };
  }
}

export async function deleteGroupAction(
  _prev: AdminPromptsState,
  fd: FormData,
): Promise<AdminPromptsState> {
  try {
    await requireAdmin();
    const groupId = parseId(fd.get("groupId"));
    if (!groupId) return { ok: false, error: "Missing group id." };
    await prisma.promptGroup.delete({ where: { id: groupId } });
    revalidateSurfaces();
    return { ok: true, message: "Group deleted." };
  } catch (e) {
    console.error("deleteGroupAction failed", e);
    return { ok: false, error: "Delete failed — try again." };
  }
}

export async function reorderGroupAction(
  _prev: AdminPromptsState,
  fd: FormData,
): Promise<AdminPromptsState> {
  try {
    await requireAdmin();
    const groupId = parseId(fd.get("groupId"));
    const direction = parseDirection(fd.get("direction"));
    if (!groupId || !direction) {
      return { ok: false, error: "Missing id or direction." };
    }

    const all = await prisma.promptGroup.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });
    const idx = all.findIndex((g) => g.id === groupId);
    if (idx === -1) return { ok: false, error: "Group not found." };
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= all.length) {
      return { ok: true, message: "Already at end." };
    }

    const a = all[idx];
    const b = all[neighborIdx];
    await prisma.$transaction([
      prisma.promptGroup.update({
        where: { id: a.id },
        data: { sortOrder: b.sortOrder },
      }),
      prisma.promptGroup.update({
        where: { id: b.id },
        data: { sortOrder: a.sortOrder },
      }),
    ]);
    revalidateSurfaces();
    return { ok: true, message: "Reordered." };
  } catch (e) {
    console.error("reorderGroupAction failed", e);
    return { ok: false, error: "Reorder failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// Item actions

export async function createItemAction(
  _prev: AdminPromptsState,
  fd: FormData,
): Promise<AdminPromptsState> {
  try {
    await requireAdmin();
    const groupId = parseId(fd.get("groupId"));
    if (!groupId) return { ok: false, error: "Missing group id." };
    const label = normalizeString(fd.get("label"), MAX_ITEM_LABEL);
    const prompt = normalizeMultiline(fd.get("prompt"), MAX_PROMPT_CHARS);
    if (!label) return { ok: false, error: "Label is required." };
    if (!prompt) return { ok: false, error: "Prompt is required." };

    const group = await prisma.promptGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) return { ok: false, error: "Group not found." };

    const max = await prisma.promptSuggestion.aggregate({
      where: { groupId },
      _max: { sortOrder: true },
    });
    const nextOrder = (max._max.sortOrder ?? -1) + 1;

    await prisma.promptSuggestion.create({
      data: { groupId, label, prompt, sortOrder: nextOrder },
    });
    revalidateSurfaces();
    return { ok: true, message: `Added "${label}".` };
  } catch (e) {
    console.error("createItemAction failed", e);
    return { ok: false, error: "Create failed — try again." };
  }
}

export async function updateItemAction(
  _prev: AdminPromptsState,
  fd: FormData,
): Promise<AdminPromptsState> {
  try {
    await requireAdmin();
    const itemId = parseId(fd.get("itemId"));
    if (!itemId) return { ok: false, error: "Missing item id." };
    const label = normalizeString(fd.get("label"), MAX_ITEM_LABEL);
    const prompt = normalizeMultiline(fd.get("prompt"), MAX_PROMPT_CHARS);
    if (!label) return { ok: false, error: "Label is required." };
    if (!prompt) return { ok: false, error: "Prompt is required." };
    const isActive = fd.get("isActive") === "on";

    const result = await prisma.promptSuggestion.updateMany({
      where: { id: itemId },
      data: { label, prompt, isActive },
    });
    if (result.count === 0) {
      return { ok: false, error: "Item not found." };
    }
    revalidateSurfaces();
    return { ok: true, message: `Updated "${label}".` };
  } catch (e) {
    console.error("updateItemAction failed", e);
    return { ok: false, error: "Update failed — try again." };
  }
}

export async function deleteItemAction(
  _prev: AdminPromptsState,
  fd: FormData,
): Promise<AdminPromptsState> {
  try {
    await requireAdmin();
    const itemId = parseId(fd.get("itemId"));
    if (!itemId) return { ok: false, error: "Missing item id." };
    await prisma.promptSuggestion.delete({ where: { id: itemId } });
    revalidateSurfaces();
    return { ok: true, message: "Item deleted." };
  } catch (e) {
    console.error("deleteItemAction failed", e);
    return { ok: false, error: "Delete failed — try again." };
  }
}

export async function reorderItemAction(
  _prev: AdminPromptsState,
  fd: FormData,
): Promise<AdminPromptsState> {
  try {
    await requireAdmin();
    const itemId = parseId(fd.get("itemId"));
    const direction = parseDirection(fd.get("direction"));
    if (!itemId || !direction) {
      return { ok: false, error: "Missing id or direction." };
    }

    const target = await prisma.promptSuggestion.findUnique({
      where: { id: itemId },
      select: { id: true, groupId: true, sortOrder: true },
    });
    if (!target) return { ok: false, error: "Item not found." };

    const siblings = await prisma.promptSuggestion.findMany({
      where: { groupId: target.groupId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });
    const idx = siblings.findIndex((s) => s.id === itemId);
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= siblings.length) {
      return { ok: true, message: "Already at end." };
    }

    const a = siblings[idx];
    const b = siblings[neighborIdx];
    await prisma.$transaction([
      prisma.promptSuggestion.update({
        where: { id: a.id },
        data: { sortOrder: b.sortOrder },
      }),
      prisma.promptSuggestion.update({
        where: { id: b.id },
        data: { sortOrder: a.sortOrder },
      }),
    ]);
    revalidateSurfaces();
    return { ok: true, message: "Reordered." };
  } catch (e) {
    console.error("reorderItemAction failed", e);
    return { ok: false, error: "Reorder failed — try again." };
  }
}
