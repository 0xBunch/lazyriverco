"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { BANNED_LABEL, invalidateTaxonomyCache } from "@/lib/ai-taxonomy";
import { parseTag } from "@/lib/tag-shape";

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

// Per-bucket cap. 100 × ~20 avg chars × 4 buckets ≈ 8KB of hint text that
// lands in every Gemini call — plenty of room for a real working vocab
// (rarely exceeds 40/bucket in practice), and small enough that a
// compromised admin session can't balloon the prompt so far that
// "preferred vocabulary" dominates the actual tag-this-image task.
// Security-sentinel recommendation over the initial 200.
//
// Slug shape + length cap come from src/lib/tag-shape.ts so what the
// admin enters here matches what the model can legally produce and what
// Media.tags stores. One regex literal, no drift.
const MAX_SLUGS_PER_BUCKET = 100;

function revalidateTaxonomySurfaces(): void {
  invalidateTaxonomyCache();
  revalidatePath("/admin/taxonomy");
}

function revalidateGallerySurfaces(): void {
  // Banning a slug mutates Media.tags on the sweep path — refresh every
  // surface that reads from there. /gallery/[id] revalidation is tag-
  // page-granular, which we don't have visibility into; Next's RSC
  // caching on dynamic routes means the next request fetches fresh.
  revalidatePath("/gallery");
  revalidatePath("/admin/gallery");
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
    const slug = parseTag(fd.get("slug"));
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

    // Cross-bucket contradiction check: if adding to a preferred bucket,
    // reject if the slug is currently banned. Otherwise the prompt would
    // emit both "prefer X" and "never emit X" and the model behavior is
    // undefined. Admin can `unban → add` if that's what they want.
    if (bucket.label !== BANNED_LABEL) {
      const bannedBucket = await prisma.taxonomyBucket.findUnique({
        where: { label: BANNED_LABEL },
        select: { slugs: true },
      });
      if (bannedBucket?.slugs.includes(slug)) {
        return {
          ok: false,
          error: `"${slug}" is currently banned. Remove it from the banned bucket first.`,
        };
      }
    }

    if (bucket.label === BANNED_LABEL) {
      // Ban flow: (1) add to banned, (2) strip from every preferred
      // bucket so the prompt stays coherent, (3) strip from every
      // Media.tags + Media.aiTags so it vanishes from the grid / FTS /
      // tile UI on the next render. All three in a transaction — if any
      // step fails, none land.
      const sweptMedia = await prisma.$transaction(async (tx) => {
        await tx.taxonomyBucket.update({
          where: { id: bucketId },
          data: { slugs: { push: slug } },
        });
        // array_remove is a no-op on rows that don't have the value, so
        // this is safe to run across every preferred bucket regardless
        // of which ones actually contained the slug.
        await tx.$executeRaw`
          UPDATE "TaxonomyBucket"
          SET "slugs" = array_remove("slugs", ${slug})
          WHERE "label" != ${BANNED_LABEL}
        `;
        // Sweep Media. Both columns in one statement so the row is
        // updated once, not twice. WHERE clause skips rows that don't
        // have the slug in either column — minimizes write amplification.
        const rowsAffected = await tx.$executeRaw`
          UPDATE "Media"
          SET "tags" = array_remove("tags", ${slug}),
              "aiTags" = array_remove("aiTags", ${slug})
          WHERE ${slug} = ANY("tags") OR ${slug} = ANY("aiTags")
        `;
        return Number(rowsAffected);
      });

      revalidateTaxonomySurfaces();
      revalidateGallerySurfaces();
      return {
        ok: true,
        message: `Banned "${slug}". Stripped from ${sweptMedia} gallery item${sweptMedia === 1 ? "" : "s"} and any preferred buckets.`,
      };
    }

    // Normal preferred-bucket add.
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
