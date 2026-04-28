"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SponsorImageShape } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  MAX_SPONSOR_BYTES,
  R2UploadError,
  assertObjectWithinSize,
  deleteObject,
  isValidSponsorKey,
} from "@/lib/r2";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import {
  generateSponsorBannerImage,
  SponsorImageGenError,
} from "@/lib/sports/sponsor-image-gen";

const MAX_NAME = 80;
const MAX_TAGLINE = 140;
const MAX_URL = 2048;
const MAX_ALT = 280;

type ImageFields = {
  imageR2Key: string | null;
  imageAltText: string | null;
  imageShape: SponsorImageShape | null;
};

export async function createSponsor(fd: FormData): Promise<void> {
  await requireAdmin();

  const name = readField(fd, "name", MAX_NAME);
  const tagline = readOptional(fd, "tagline", MAX_TAGLINE);
  const hrefRaw = readOptional(fd, "href", MAX_URL);
  const displayOrderRaw = Number(fd.get("displayOrder") ?? 0);
  const active = fd.get("active") === "on";

  if (!name) return back({ error: "Sponsor name is required." });

  const hrefResult = normalizeHref(hrefRaw);
  if (hrefResult.error) return back({ error: hrefResult.error });

  const imageResult = readImageFields(fd);
  if (!imageResult.ok) return back({ error: imageResult.error });

  // Verify the just-uploaded R2 object respects the size cap. Runs only
  // when an imageR2Key was submitted. On failure, delete the orphan.
  if (imageResult.fields.imageR2Key) {
    const sizeError = await verifyAndSizeGuard(imageResult.fields.imageR2Key);
    if (sizeError) return back({ error: sizeError });
  }

  await prisma.sportsSponsor.create({
    data: {
      name,
      tagline,
      href: hrefResult.value,
      active,
      displayOrder: Number.isFinite(displayOrderRaw)
        ? Math.trunc(displayOrderRaw)
        : 0,
      ...imageResult.fields,
    },
  });
  revalidatePath("/admin/sports/sponsors");
  revalidatePath("/sports");
  return back({ msg: `Added ${name}.` });
}

export async function updateSponsor(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing sponsor id." });

  const existing = await prisma.sportsSponsor.findUnique({
    where: { id },
    select: { imageR2Key: true },
  });
  if (!existing) return back({ error: "Sponsor not found." });

  const name = readField(fd, "name", MAX_NAME);
  const tagline = readOptional(fd, "tagline", MAX_TAGLINE);
  const hrefRaw = readOptional(fd, "href", MAX_URL);
  const displayOrderRaw = Number(fd.get("displayOrder") ?? 0);
  const active = fd.get("active") === "on";

  if (!name) return back({ error: "Sponsor name is required." });

  const hrefResult = normalizeHref(hrefRaw);
  if (hrefResult.error) return back({ error: hrefResult.error });

  const imageResult = readImageFields(fd);
  if (!imageResult.ok) return back({ error: imageResult.error });

  // Only re-verify size if the key actually changed in this submission.
  // Saving a sponsor without re-uploading shouldn't HEAD R2.
  const newKey = imageResult.fields.imageR2Key;
  if (newKey && newKey !== existing.imageR2Key) {
    const sizeError = await verifyAndSizeGuard(newKey);
    if (sizeError) return back({ error: sizeError });
  }

  await prisma.sportsSponsor.update({
    where: { id },
    data: {
      name,
      tagline,
      href: hrefResult.value,
      active,
      displayOrder: Number.isFinite(displayOrderRaw)
        ? Math.trunc(displayOrderRaw)
        : 0,
      ...imageResult.fields,
    },
  });

  // Clean up the previous R2 object if the admin replaced or removed
  // the image. Best-effort — failure to delete leaves an orphan but
  // doesn't break the save.
  if (
    existing.imageR2Key &&
    existing.imageR2Key !== imageResult.fields.imageR2Key
  ) {
    deleteObject(existing.imageR2Key).catch(() => {});
  }

  revalidatePath("/admin/sports/sponsors");
  revalidatePath("/sports");
  return back({ msg: `Updated ${name}.` });
}

export async function toggleSponsorActive(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing sponsor id." });

  const s = await prisma.sportsSponsor.findUnique({
    where: { id },
    select: { active: true, name: true },
  });
  if (!s) return back({ error: "Sponsor not found." });

  await prisma.sportsSponsor.update({
    where: { id },
    data: { active: !s.active },
  });
  revalidatePath("/admin/sports/sponsors");
  revalidatePath("/sports");
  return back({
    msg: s.active ? `${s.name} paused.` : `${s.name} active.`,
  });
}

export async function deleteSponsor(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing sponsor id." });

  let imageKey: string | null = null;
  try {
    const row = await prisma.sportsSponsor.findUnique({
      where: { id },
      select: { imageR2Key: true },
    });
    imageKey = row?.imageR2Key ?? null;
    await prisma.sportsSponsor.delete({ where: { id } });
  } catch (e) {
    console.error("deleteSponsor failed", e);
    return back({ error: "Couldn't delete the sponsor." });
  }

  if (imageKey) {
    deleteObject(imageKey).catch(() => {});
  }

  revalidatePath("/admin/sports/sponsors");
  revalidatePath("/sports");
  return back({ msg: "Sponsor deleted." });
}

/// Generate a sponsor banner image via Nano Banana Pro and attach it
/// to an existing sponsor. AI is edit-only — the admin must save the
/// sponsor (creating a row) before generating, so this action always
/// has an id to update. Replaces any existing imageR2Key on the row;
/// the previous R2 object is deleted (best-effort).
export async function generateSponsorImage(fd: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing sponsor id." });

  const prompt = readField(fd, "prompt", 600);
  if (!prompt) {
    return back({ error: "Prompt is required." });
  }

  const existing = await prisma.sportsSponsor.findUnique({
    where: { id },
    select: { imageR2Key: true, name: true },
  });
  if (!existing) return back({ error: "Sponsor not found." });

  // Rate limit BEFORE the Gemini call so a stolen cookie can't burn
  // through unbounded $0.04 generations.
  try {
    await assertWithinLimit(admin.id, "sports.sponsor.generate", {
      maxPerMinute: 5,
      maxPerDay: 20,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return back({
        error: `Hit the AI generation limit. Try again in ${Math.ceil(e.retryAfterSeconds / 60)} minute(s).`,
      });
    }
    throw e;
  }

  let generated: Awaited<ReturnType<typeof generateSponsorBannerImage>>;
  try {
    generated = await generateSponsorBannerImage({ prompt });
  } catch (e) {
    if (e instanceof SponsorImageGenError) {
      return back({ error: e.message });
    }
    if (e instanceof R2UploadError) {
      return back({ error: `Couldn't store the generated image: ${e.message}` });
    }
    console.error("generateSponsorImage failed", e);
    return back({
      error: "AI generation failed unexpectedly. Try again.",
    });
  }

  await prisma.sportsSponsor.update({
    where: { id },
    data: {
      imageR2Key: generated.key,
      imageShape: "SQUARE",
      // Default alt text to a truncated version of the prompt — admin
      // can edit it from the main form afterward.
      imageAltText: prompt.slice(0, 240),
    },
  });

  // Replace previous banner: delete the orphan R2 object (best-effort).
  if (existing.imageR2Key && existing.imageR2Key !== generated.key) {
    deleteObject(existing.imageR2Key).catch(() => {});
  }

  revalidatePath("/admin/sports/sponsors");
  revalidatePath("/sports");
  return back({
    msg: `Generated a new banner for ${existing.name}.`,
    edit: id,
  });
}

/// Drop the banner image from a sponsor without touching the rest of
/// its fields. Used by the admin form's "Remove image" affordance.
export async function removeSponsorImage(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing sponsor id." });

  const existing = await prisma.sportsSponsor.findUnique({
    where: { id },
    select: { imageR2Key: true, name: true },
  });
  if (!existing) return back({ error: "Sponsor not found." });

  await prisma.sportsSponsor.update({
    where: { id },
    data: {
      imageR2Key: null,
      imageAltText: null,
      imageShape: null,
    },
  });

  if (existing.imageR2Key) {
    deleteObject(existing.imageR2Key).catch(() => {});
  }

  revalidatePath("/admin/sports/sponsors");
  revalidatePath("/sports");
  return back({ msg: `Removed image from ${existing.name}.` });
}

// ---------------------------------------------------------------------------
// Helpers

function readField(fd: FormData, key: string, max: number): string {
  return (fd.get(key) ?? "").toString().trim().slice(0, max);
}

function readOptional(fd: FormData, key: string, max: number): string | null {
  const v = readField(fd, key, max);
  return v.length > 0 ? v : null;
}

/// Run the user-submitted href through `new URL()` to reject smuggled
/// schemes (`javascript:`, `data:`, malformed inputs) — the regex check
/// alone wasn't enough per the security review. Also confirms protocol
/// is http(s) only.
function normalizeHref(raw: string | null): {
  value: string | null;
  error?: string;
} {
  if (!raw) return { value: null };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { value: null, error: "Click-through URL is not a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      value: null,
      error: "Click-through URL must use http:// or https://",
    };
  }
  return { value: parsed.toString() };
}

/// Pull image fields from FormData and validate. Either an image is
/// set (key + auto-assigned SQUARE shape) or none — matching the SQL
/// CHECK constraint on SportsSponsor. Sponsors are square-only since
/// the rail restructure; BILLBOARD is no longer reachable from admin.
type ImageFieldsResult =
  | { ok: true; fields: ImageFields }
  | { ok: false; error: string };

function readImageFields(fd: FormData): ImageFieldsResult {
  const imageR2Key = readOptional(fd, "imageR2Key", 200);
  const imageAltText = readOptional(fd, "imageAltText", MAX_ALT);

  if (!imageR2Key) {
    return {
      ok: true,
      fields: { imageR2Key: null, imageAltText: null, imageShape: null },
    };
  }

  if (!isValidSponsorKey(imageR2Key)) {
    return {
      ok: false,
      error: "Image upload key is invalid. Try re-uploading the image.",
    };
  }

  return {
    ok: true,
    fields: {
      imageR2Key,
      imageAltText,
      imageShape: "SQUARE",
    },
  };
}

/// HEAD the freshly-uploaded R2 object and confirm it respects the
/// MAX_SPONSOR_BYTES cap. On overage, delete the orphan (best-effort)
/// and surface a user-facing error. Returns null on success.
async function verifyAndSizeGuard(key: string): Promise<string | null> {
  try {
    await assertObjectWithinSize(key, MAX_SPONSOR_BYTES);
    return null;
  } catch (e) {
    deleteObject(key).catch(() => {});
    if (e instanceof R2UploadError) {
      return `Image rejected: ${e.message}`;
    }
    console.error("verifyAndSizeGuard failed", e);
    return "Image upload couldn't be verified. Try again.";
  }
}

function back(flash: {
  msg?: string;
  error?: string;
  /// If provided, the redirect lands back on the edit form for this
  /// sponsor instead of the list. Used by `generateSponsorImage` so the
  /// admin can immediately iterate or save.
  edit?: string;
}): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  if (flash.edit) params.set("edit", flash.edit);
  const qs = params.toString();
  redirect(qs ? `/admin/sports/sponsors?${qs}` : "/admin/sports/sponsors");
}
