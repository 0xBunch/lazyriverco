"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { BANNED_LABEL, invalidateTaxonomyCache } from "@/lib/ai-taxonomy";
import { parseTag } from "@/lib/tag-shape";
import {
  classifyTagsIntoBuckets,
  type BucketForClassify,
} from "@/lib/classify-tag-bucket";

// Tag-first admin API for /admin/memory/taxonomy. v1.5 promoted tags to a
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
const MAX_BULK_EDIT_SLUGS = 500;
const MAX_BUCKET_LABEL_CHARS = 40;
const MAX_BUCKET_DESCRIPTION_CHARS = 1000;

function revalidateSurfaces(): void {
  invalidateTaxonomyCache();
  revalidatePath("/admin/memory/taxonomy");
}

function revalidateLibrarySurfaces(): void {
  revalidatePath("/library");
  revalidatePath("/admin/memory/library");
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
      revalidateLibrarySurfaces();
      return { ok: true, message: `Banned "${slug}" and swept it from library items.` };
    }

    // Non-banned move (including unban). Just flip bucketId — no Media
    // sweep. Intentional asymmetry with the banned branch above:
    // leaving `banned` means "future AI can emit this again" but does
    // NOT restore the slug to items that had it stripped during the
    // ban. That's the "ban is a one-way write to the library" contract
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
        revalidateLibrarySurfaces();
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
    revalidateLibrarySurfaces();
    return { ok: true, message: `Deleted "${slug}" and swept it from library items.` };
  } catch (e) {
    console.error("deleteTagAction failed", e);
    return { ok: false, error: "Delete failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// bulkAssignBucketAction — move N tags into one bucket in a single
// transaction. Mirrors the single-row assignTagBucketAction but lifted
// to a slug set. When the destination is banned, update + sweep both
// happen inside one transaction so the invariant can't be left half-
// applied on mid-flight failure (same shape as bulkImportTagsAction's
// ban branch).

export async function bulkAssignBucketAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const slugs = parseBulkSlugs(fd);
    if (slugs.length === 0) return { ok: false, error: "No tags selected." };

    const bucketIdRaw = fd.get("bucketId");
    const nextBucketId =
      typeof bucketIdRaw === "string" && bucketIdRaw ? bucketIdRaw : null;

    if (nextBucketId) {
      const bucketExists = await prisma.taxonomyBucket.findUnique({
        where: { id: nextBucketId },
        select: { id: true },
      });
      if (!bucketExists) return { ok: false, error: "Bucket not found." };
    }

    const bannedId = await resolveBannedBucketId();
    const movingToBanned = nextBucketId !== null && nextBucketId === bannedId;

    if (movingToBanned) {
      await prisma.$transaction(async (tx) => {
        await tx.tag.updateMany({
          where: { slug: { in: slugs } },
          data: { bucketId: nextBucketId },
        });
        await tx.$executeRaw`
          UPDATE "Media"
          SET "tags" = "tags" - ${slugs}::text[],
              "aiTags" = "aiTags" - ${slugs}::text[]
          WHERE "tags" && ${slugs}::text[]
             OR "aiTags" && ${slugs}::text[]
        `;
      });
      revalidateSurfaces();
      revalidateLibrarySurfaces();
      return {
        ok: true,
        message: `Banned ${slugs.length} tag${slugs.length === 1 ? "" : "s"} and swept them from library items.`,
      };
    }

    const result = await prisma.tag.updateMany({
      where: { slug: { in: slugs } },
      data: { bucketId: nextBucketId },
    });
    revalidateSurfaces();
    const target = nextBucketId ? "bucket" : "Uncategorized";
    return {
      ok: true,
      message: `Moved ${result.count} tag${result.count === 1 ? "" : "s"} to ${target === "bucket" ? "the selected bucket" : target}.`,
    };
  } catch (e) {
    console.error("bulkAssignBucketAction failed", e);
    return { ok: false, error: "Bulk move failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// bulkDeleteTagsAction — remove N Tag rows + sweep all N slugs from every
// Media row in a single transaction. Modelled on deleteTagAction lifted
// to arrays. The array-literal form of `- ::text[]` removes every
// occurrence of every slug in one UPDATE.

export async function bulkDeleteTagsAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const slugs = parseBulkSlugs(fd);
    if (slugs.length === 0) return { ok: false, error: "No tags selected." };

    const found = await prisma.tag.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true },
    });
    const foundSlugs = found.map((t) => t.slug);
    if (foundSlugs.length === 0) {
      return { ok: false, error: "None of the selected tags exist." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "Media"
        SET "tags" = "tags" - ${foundSlugs}::text[],
            "aiTags" = "aiTags" - ${foundSlugs}::text[]
        WHERE "tags" && ${foundSlugs}::text[]
           OR "aiTags" && ${foundSlugs}::text[]
      `;
      await tx.tag.deleteMany({ where: { slug: { in: foundSlugs } } });
    });

    revalidateSurfaces();
    revalidateLibrarySurfaces();
    return {
      ok: true,
      message: `Deleted ${foundSlugs.length} tag${foundSlugs.length === 1 ? "" : "s"} and swept them from library items.`,
    };
  } catch (e) {
    console.error("bulkDeleteTagsAction failed", e);
    return { ok: false, error: "Bulk delete failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// addBucketAction / renameBucketAction — basic bucket editing. Skip
// delete + merge: both need Media-sweep semantics that are worth a
// separate design pass.

export async function addBucketAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const label = normalizeBucketLabel(fd.get("label"));
    if (!label) {
      return {
        ok: false,
        error: `Label must be 1-${MAX_BUCKET_LABEL_CHARS} chars after trim.`,
      };
    }

    const sortOrderRaw = fd.get("sortOrder");
    let sortOrder: number;
    if (typeof sortOrderRaw === "string" && sortOrderRaw.trim()) {
      const parsed = Number.parseInt(sortOrderRaw, 10);
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: "Sort order must be a number." };
      }
      sortOrder = parsed;
    } else {
      const max = await prisma.taxonomyBucket.aggregate({
        _max: { sortOrder: true },
      });
      sortOrder = (max._max.sortOrder ?? -1) + 1;
    }

    try {
      await prisma.taxonomyBucket.create({ data: { label, sortOrder } });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        return { ok: false, error: `Bucket "${label}" already exists.` };
      }
      throw e;
    }

    revalidateSurfaces();
    return { ok: true, message: `Added bucket "${label}".` };
  } catch (e) {
    console.error("addBucketAction failed", e);
    return { ok: false, error: "Add bucket failed — try again." };
  }
}

// v2: updateBucketAction supersedes v1's renameBucketAction. Accepts
// label + optional description. Presence of a non-empty description
// promotes the bucket to "priority" treatment in the Gemini hint and
// classify destination filter. Empty description = secondary bucket.
export async function updateBucketAction(
  _prev: AdminTaxonomyState,
  fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();
    const idRaw = fd.get("id");
    const id = typeof idRaw === "string" ? idRaw : "";
    if (!id) return { ok: false, error: "Missing bucket id." };
    const label = normalizeBucketLabel(fd.get("label"));
    if (!label) {
      return {
        ok: false,
        error: `Label must be 1-${MAX_BUCKET_LABEL_CHARS} chars after trim.`,
      };
    }
    const description = normalizeMultilineString(
      fd.get("description"),
      MAX_BUCKET_DESCRIPTION_CHARS,
    );

    const existing = await prisma.taxonomyBucket.findUnique({
      where: { id },
      select: { id: true, label: true, description: true },
    });
    if (!existing) return { ok: false, error: "Bucket not found." };
    if (existing.label === label && existing.description === description) {
      return { ok: true, message: "No change." };
    }

    try {
      await prisma.taxonomyBucket.update({
        where: { id },
        data: { label, description },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        return { ok: false, error: `Bucket "${label}" already exists.` };
      }
      throw e;
    }

    revalidateSurfaces();
    // Tailor the success message to what actually changed so the admin
    // knows the priority / secondary tier flipped when they toggled the
    // description. normalizeMultilineString trims + returns null on
    // empty, so `!== null` alone is the priority signal on both sides.
    const labelChanged = existing.label !== label;
    const wasPriority = existing.description !== null;
    const isPriority = description !== null;
    let msg = labelChanged ? `Renamed to "${label}".` : `Updated "${label}".`;
    if (wasPriority !== isPriority) {
      msg += isPriority
        ? " Bucket is now priority."
        : " Bucket is now secondary.";
    }
    return { ok: true, message: msg };
  } catch (e) {
    console.error("updateBucketAction failed", e);
    return { ok: false, error: "Update failed — try again." };
  }
}

// ---------------------------------------------------------------------------
// classifyUncategorizedAction — one Haiku call across every bucketId=null
// tag; write the results back with a `bucketId: null` guard so we never
// clobber a manual assignment that raced with the call. Null model
// verdicts (ambiguous) stay uncategorized. Admin can override anything
// via the single-row editor or bulk-move.

export async function classifyUncategorizedAction(
  _prev: AdminTaxonomyState,
  _fd: FormData,
): Promise<AdminTaxonomyState> {
  try {
    await requireAdmin();

    const [uncategorizedTags, buckets] = await Promise.all([
      prisma.tag.findMany({
        where: { bucketId: null },
        select: { slug: true },
        orderBy: { slug: "asc" },
      }),
      prisma.taxonomyBucket.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          tags: {
            select: { slug: true },
            orderBy: { slug: "asc" },
            take: 10,
          },
        },
      }),
    ]);

    if (uncategorizedTags.length === 0) {
      return { ok: true, message: "Nothing to classify." };
    }

    // v2: only priority buckets (description set) are valid classify
    // destinations. Banned is excluded — we don't auto-ban. Generic
    // tags that don't fit any priority bucket stay null. Type-guard
    // narrows `description` so downstream .trim() is unambiguous.
    type BucketWithDescription = (typeof buckets)[number] & {
      description: string;
    };
    const isPriority = (
      b: (typeof buckets)[number],
    ): b is BucketWithDescription =>
      b.label !== BANNED_LABEL &&
      b.description !== null &&
      b.description.trim().length > 0;
    const priorityBuckets = buckets.filter(isPriority);
    if (priorityBuckets.length === 0) {
      return {
        ok: false,
        error:
          "No priority buckets defined — add a description to at least one bucket before classifying.",
      };
    }

    const slugs = uncategorizedTags.map((t) => t.slug);
    const bucketInput: BucketForClassify[] = priorityBuckets.map((b) => ({
      id: b.id,
      label: b.label,
      description: b.description.trim(),
      sampleSlugs: b.tags.map((t) => t.slug),
    }));

    const result = await classifyTagsIntoBuckets(slugs, bucketInput);

    // Group by bucket id → slugs for one updateMany per bucket. Keeps
    // the write atomic per bucket. The `bucketId: null` guard means we
    // never clobber a manual assignment that raced with the classify call.
    const byBucket = new Map<string, string[]>();
    let nullCount = 0;
    for (const [slug, bucketId] of result.entries()) {
      if (bucketId === null) {
        nullCount++;
        continue;
      }
      const list = byBucket.get(bucketId) ?? [];
      list.push(slug);
      byBucket.set(bucketId, list);
    }

    let assignedCount = 0;
    if (byBucket.size > 0) {
      await prisma.$transaction(
        Array.from(byBucket.entries()).map(([bucketId, bucketSlugs]) =>
          prisma.tag.updateMany({
            where: { slug: { in: bucketSlugs }, bucketId: null },
            data: { bucketId },
          }),
        ),
      );
      for (const rows of byBucket.values()) {
        assignedCount += rows.length;
      }
    }

    revalidateSurfaces();
    return {
      ok: true,
      message: `Classified ${assignedCount} into ${byBucket.size} priority bucket${byBucket.size === 1 ? "" : "s"}; ${nullCount} left uncategorized (generic tags stay loose on purpose).`,
    };
  } catch (e) {
    console.error("classifyUncategorizedAction failed", e);
    return { ok: false, error: "Classify failed — try again." };
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

function normalizeBucketLabel(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_BUCKET_LABEL_CHARS) return null;
  return trimmed;
}

// Bulk actions accept multiple `<input name="slug">` fields. FormData.getAll
// returns every value; we dedupe + parseTag-validate. Cap at MAX_BULK_EDIT_SLUGS
// so a pathological request can't ask us to update the entire registry in one
// txn.
function parseBulkSlugs(fd: FormData): string[] {
  const raw = fd.getAll("slug");
  const out = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const normalized = parseTag(v);
    if (normalized) out.add(normalized);
    if (out.size >= MAX_BULK_EDIT_SLUGS) break;
  }
  return Array.from(out);
}

// Prisma's P2002 surfaces as an object with a `code` property. We only
// pattern-match `code`; avoid importing the Prisma namespace type to keep
// this file lean.
function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "P2002"
  );
}
