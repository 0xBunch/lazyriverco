"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { BANNED_LABEL, invalidateTaxonomyCache } from "@/lib/ai-taxonomy";
import { parseTag } from "@/lib/tag-shape";

// Tag-first admin API for /admin/taxonomy. v1.5 promoted tags to a
// first-class Tag entity; this file owns the CRUD.
//
// All actions are useFormState-compatible: signature is
// (prevState, formData) => State so client forms bind via
// `useFormState(action, null)` and surface validation + errors inline
// instead of through Next's anonymized digest error boundary.
//
// Invariant enforced across actions: when a tag's bucket is the
// "banned" bucket, the slug must be absent from every Media.tags and
// Media.aiTags row. The ban-sweep runs inside the action that moves a
// tag into that bucket.

export type AdminTaxonomyState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

const MAX_DESCRIPTION_CHARS = 500;
const MAX_LABEL_CHARS = 80;
const MAX_BULK_IMPORT_TAGS = 100;

function revalidateSurfaces(): void {
  invalidateTaxonomyCache();
  revalidatePath("/admin/taxonomy");
}

function revalidateGallerySurfaces(): void {
  revalidatePath("/gallery");
  revalidatePath("/admin/gallery");
}

async function resolveBannedBucketId(): Promise<string | null> {
  const bucket = await prisma.taxonomyBucket.findUnique({
    where: { label: BANNED_LABEL },
    select: { id: true },
  });
  return bucket?.id ?? null;
}

// ---------------------------------------------------------------------------
// addTagAction — create a brand-new Tag row, optionally assign a bucket.

export async function addTagAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const slug = parseTag(fd.get("slug"));
    if (!slug) {
      return {
        ok: false,
        error: "Slug must be lowercase a-z, 0-9, dash/underscore, up to 40 chars.",
      };
    }
    const bucketIdRaw = fd.get("bucketId");
    const bucketId =
      typeof bucketIdRaw === "string" && bucketIdRaw ? bucketIdRaw : null;

    const existing = await prisma.tag.findUnique({ where: { slug } });
    if (existing) {
      return { ok: false, error: `Tag "${slug}" already exists.` };
    }

    await prisma.tag.create({ data: { slug, bucketId } });

    // If the admin created a tag straight into the banned bucket we
    // still need to sweep Media — unusual flow (the tag wouldn't be on
    // any Media row yet) but kept safe. assignBucket handles the sweep.
    if (bucketId) {
      const bannedId = await resolveBannedBucketId();
      if (bucketId === bannedId) {
        await sweepMediaForSlug(slug);
      }
    }

    revalidateSurfaces();
    return { ok: true, message: `Added tag "${slug}".` };
  } catch (e) {
    console.error("addTagAction failed", e);
    return { ok: false, error: "Add failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// assignTagBucketAction — move a tag between buckets. Destination
// "banned" also sweeps Media; leaving "banned" does NOT restore
// previously-stripped rows (that was the whole point of the ban).

export async function assignTagBucketAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const slug = parseTag(fd.get("slug"));
    if (!slug) return { ok: false, error: "Missing or malformed slug." };
    // Empty string from a <select> <option value=""> means "uncategorized."
    const bucketIdRaw = fd.get("bucketId");
    const nextBucketId =
      typeof bucketIdRaw === "string" && bucketIdRaw ? bucketIdRaw : null;

    const tag = await prisma.tag.findUnique({
      where: { slug },
      select: { id: true, bucketId: true, bucket: { select: { label: true } } },
    });
    if (!tag) return { ok: false, error: `Tag "${slug}" not found.` };

    if (tag.bucketId === nextBucketId) {
      return { ok: true, message: `"${slug}" already in that bucket.` };
    }

    const bannedId = await resolveBannedBucketId();
    const movingToBanned = nextBucketId !== null && nextBucketId === bannedId;

    if (movingToBanned) {
      // Same atomic shape as v1.4 ban: update Tag + sweep Media in a
      // single transaction so we can't leave the invariant half-applied.
      await prisma.$transaction(async (tx) => {
        await tx.tag.update({
          where: { id: tag.id },
          data: { bucketId: nextBucketId },
        });
        await tx.$executeRaw`
          UPDATE "Media"
          SET "tags" = array_remove("tags", ${slug}),
              "aiTags" = array_remove("aiTags", ${slug})
          WHERE ${slug} = ANY("tags") OR ${slug} = ANY("aiTags")
        `;
      });
      revalidateSurfaces();
      revalidateGallerySurfaces();
      return { ok: true, message: `Banned "${slug}" and swept it from gallery items.` };
    }

    // Non-banned move (including unban). Just flip bucketId — no Media
    // sweep. Intentional asymmetry with the banned branch above:
    // leaving `banned` means "future AI can emit this again" but does
    // NOT restore the slug to items that had it stripped during the
    // ban. That's the "ban is a one-way write to the gallery" contract
    // — any admin who wants a formerly-banned tag back on specific
    // items re-adds manually. A future "restore" flow would be a new
    // action, not a side effect of unban.
    await prisma.tag.update({
      where: { id: tag.id },
      data: { bucketId: nextBucketId },
    });
    revalidateSurfaces();
    const verb = tag.bucket?.label === BANNED_LABEL ? "Unbanned" : "Moved";
    return { ok: true, message: `${verb} "${slug}".` };
  } catch (e) {
    console.error("assignTagBucketAction failed", e);
    return { ok: false, error: "Reassign failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// updateTagMetaAction — edit description + label (no bucket change).

export async function updateTagMetaAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const slug = parseTag(fd.get("slug"));
    if (!slug) return { ok: false, error: "Missing or malformed slug." };

    const labelRaw = fd.get("label");
    const descriptionRaw = fd.get("description");

    const label = normalizeShortString(labelRaw, MAX_LABEL_CHARS);
    const description = normalizeMultilineString(
      descriptionRaw,
      MAX_DESCRIPTION_CHARS,
    );

    const result = await prisma.tag.updateMany({
      where: { slug },
      data: { label, description },
    });
    if (result.count === 0) {
      return { ok: false, error: `Tag "${slug}" not found.` };
    }
    revalidateSurfaces();
    return { ok: true, message: `Updated "${slug}".` };
  } catch (e) {
    console.error("updateTagMetaAction failed", e);
    return { ok: false, error: "Update failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// bulkImportTagsAction — paste comma/newline list, upsert Tag rows,
// optionally assign to a bucket in one shot. Per-slug validation errors
// are aggregated and reported without blocking the valid ones.

export async function bulkImportTagsAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const raw = fd.get("slugs");
    if (typeof raw !== "string" || !raw.trim()) {
      return { ok: false, error: "Paste at least one slug." };
    }
    const bucketIdRaw = fd.get("bucketId");
    const bucketId =
      typeof bucketIdRaw === "string" && bucketIdRaw ? bucketIdRaw : null;

    // Split on comma or newline, trim + lowercase + parseTag-validate
    // each. Skip invalid entries and report the count; don't fail the
    // whole import on one typo.
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > MAX_BULK_IMPORT_TAGS) {
      return {
        ok: false,
        error: `Too many at once — cap is ${MAX_BULK_IMPORT_TAGS} slugs per import.`,
      };
    }

    const validated = new Set<string>();
    const invalid: string[] = [];
    for (const p of parts) {
      const normalized = parseTag(p);
      if (normalized) validated.add(normalized);
      else invalid.push(p.slice(0, 20));
    }
    if (validated.size === 0) {
      return {
        ok: false,
        error: "No valid slugs — shape is a-z, 0-9, dash/underscore, ≤40 chars.",
      };
    }

    const slugs = Array.from(validated);

    // Upsert rows, then set bucketId for every slug in the batch. The
    // upsert is idempotent; the bucket assignment overwrites any prior
    // bucketId (user explicitly picked where this import goes).
    await prisma.tag.createMany({
      data: slugs.map((slug) => ({ slug })),
      skipDuplicates: true,
    });
    if (bucketId) {
      await prisma.tag.updateMany({
        where: { slug: { in: slugs } },
        data: { bucketId },
      });
      // If importing straight into banned, sweep Media for every slug
      // in one transactional statement. Postgres's `-` operator on
      // arrays removes every occurrence of every supplied element;
      // `&&` filters to rows that overlap with the ban set so we don't
      // UPDATE every Media row. Single statement = atomic: either every
      // slug's sweep lands or none do, preventing the partial-ban state
      // a sequential loop could leave behind on a mid-flight failure.
      const bannedId = await resolveBannedBucketId();
      if (bucketId === bannedId) {
        await prisma.$executeRaw`
          UPDATE "Media"
          SET "tags" = "tags" - ${slugs}::text[],
              "aiTags" = "aiTags" - ${slugs}::text[]
          WHERE "tags" && ${slugs}::text[]
             OR "aiTags" && ${slugs}::text[]
        `;
        revalidateGallerySurfaces();
      }
    }

    revalidateSurfaces();
    const skippedMsg = invalid.length
      ? ` Skipped ${invalid.length} invalid (${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}).`
      : "";
    return {
      ok: true,
      message: `Imported ${slugs.length} tag${slugs.length === 1 ? "" : "s"}.${skippedMsg}`,
    };
  } catch (e) {
    console.error("bulkImportTagsAction failed", e);
    return { ok: false, error: "Import failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// deleteTagAction — nuclear option. Removes the Tag row AND sweeps the
// slug from Media.tags / Media.aiTags. Distinct from ban: ban keeps the
// row as a "rejected" audit trail; delete wipes all evidence. Used for
// typos + garbage slugs that don't merit a permanent "banned" badge.

export async function deleteTagAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const slug = parseTag(fd.get("slug"));
    if (!slug) return { ok: false, error: "Missing or malformed slug." };

    const tag = await prisma.tag.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!tag) return { ok: false, error: `Tag "${slug}" not found.` };

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "Media"
        SET "tags" = array_remove("tags", ${slug}),
            "aiTags" = array_remove("aiTags", ${slug})
        WHERE ${slug} = ANY("tags") OR ${slug} = ANY("aiTags")
      `;
      await tx.tag.delete({ where: { id: tag.id } });
    });

    revalidateSurfaces();
    revalidateGallerySurfaces();
    return { ok: true, message: `Deleted "${slug}" and swept it from gallery items.` };
  } catch (e) {
    console.error("deleteTagAction failed", e);
    return { ok: false, error: "Delete failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// Shared helpers

async function sweepMediaForSlug(slug: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Media"
    SET "tags" = array_remove("tags", ${slug}),
        "aiTags" = array_remove("aiTags", ${slug})
    WHERE ${slug} = ANY("tags") OR ${slug} = ANY("aiTags")
  `;
}

function normalizeShortString(
  raw: FormDataEntryValue | null,
  cap: number,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, cap);
}

function normalizeMultilineString(
  raw: FormDataEntryValue | null,
  cap: number,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, cap);
}
