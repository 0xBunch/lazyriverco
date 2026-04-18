"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { invalidateTaxonomyCache } from "@/lib/ai-taxonomy";

// Admin CRUD for the Gemini vision taxonomy hints. Same useFormState
// discriminated-result pattern as admin/gallery/actions.ts — throws
// become Next digests in prod, returns surface as inline messages.
// Every write busts the process-local taxonomy cache so the next
// vision call on THIS Next process sees the edit immediately; other
// processes behind the Railway LB hit the 60s TTL.

export type AdminTaxonomyState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

// Same slug shape as Media.tags / aiTags so what the admin enters here
// and what the model can legally produce stay in sync. If one drifts,
// the hint tells the model to produce a slug the FTS + tag cloud
// won't match.
const TAG_SHAPE = /^[a-z0-9][a-z0-9\-_]*$/;
const MAX_TAG_CHARS = 40;
// Per-bucket cap. 100 × ~20 avg chars × 4 buckets ≈ 8KB of hint text that
// lands in every Gemini call — plenty of room for a real working vocab
// (rarely exceeds 40/bucket in practice), and small enough that a
// compromised admin session can't balloon the prompt so far that
// "preferred vocabulary" dominates the actual tag-this-image task.
// Security-sentinel recommendation over the initial 200.
const MAX_SLUGS_PER_BUCKET = 100;

function parseSlug(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t || t.length > MAX_TAG_CHARS || !TAG_SHAPE.test(t)) return null;
  return t;
}

function revalidateTaxonomySurfaces(): void {
  invalidateTaxonomyCache();
  revalidatePath("/admin/taxonomy");
}

export async function addSlugAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const bucketId = fd.get("bucketId");
    if (typeof bucketId !== "string" || !bucketId) {
      return { ok: false, error: "Missing bucket id." };
    }
    const slug = parseSlug(fd.get("slug"));
    if (!slug) {
      return {
        ok: false,
        error: "Slug must be lowercase a-z, 0-9, dash/underscore, up to 40 chars.",
      };
    }

    const bucket = await prisma.taxonomyBucket.findUnique({
      where: { id: bucketId },
      select: { slugs: true, label: true },
    });
    if (!bucket) return { ok: false, error: "Bucket not found." };
    if (bucket.slugs.includes(slug)) {
      return {
        ok: false,
        error: `"${slug}" is already in ${bucket.label}.`,
      };
    }
    if (bucket.slugs.length >= MAX_SLUGS_PER_BUCKET) {
      return {
        ok: false,
        error: `Bucket is at the ${MAX_SLUGS_PER_BUCKET}-slug cap. Remove one before adding more.`,
      };
    }

    await prisma.taxonomyBucket.update({
      where: { id: bucketId },
      data: { slugs: { push: slug } },
    });
    revalidateTaxonomySurfaces();
    return { ok: true, message: `Added "${slug}" to ${bucket.label}.` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Add failed.",
    };
  }
}

export async function removeSlugAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const bucketId = fd.get("bucketId");
    const slug = fd.get("slug");
    if (
      typeof bucketId !== "string" ||
      typeof slug !== "string" ||
      !bucketId ||
      !slug
    ) {
      return { ok: false, error: "Missing bucket id or slug." };
    }

    // Read-modify-write so we can strip an exact value — Prisma's array
    // ops can't filter by value on String[] in updateMany without raw
    // SQL at this schema version. Linear in slug count; caps at
    // MAX_SLUGS_PER_BUCKET so this is cheap.
    const bucket = await prisma.taxonomyBucket.findUnique({
      where: { id: bucketId },
      select: { slugs: true, label: true },
    });
    if (!bucket) return { ok: false, error: "Bucket not found." };
    const next = bucket.slugs.filter((s) => s !== slug);
    if (next.length === bucket.slugs.length) {
      return { ok: false, error: `"${slug}" wasn't in ${bucket.label}.` };
    }

    await prisma.taxonomyBucket.update({
      where: { id: bucketId },
      data: { slugs: next },
    });
    revalidateTaxonomySurfaces();
    return { ok: true, message: `Removed "${slug}" from ${bucket.label}.` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Remove failed.",
    };
  }
}
