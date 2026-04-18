import "server-only";
import { prisma } from "@/lib/prisma";

// Tag registry is the mirror of every slug that lands in Media.tags or
// Media.aiTags. Keeping it in sync is the whole point of the v1.5
// redesign — the admin page reads the registry, so any slug that the
// registry doesn't know about won't appear there.
//
// Call `upsertTagRegistry(slugs)` from every path that writes to
// Media.tags or Media.aiTags: ingest, upload-meta, reanalyze (via
// runVisionTagging), admin bulk-tag-add. No-op for empty input.

/**
 * Ensure every slug in `slugs` exists as a row in the Tag table.
 * Idempotent — rows that already exist are left alone (no updatedAt
 * bump). New rows land with bucketId = null so they show up in the
 * admin's "Uncategorized" filter until the admin assigns a bucket.
 *
 * Deliberately best-effort: any DB error is logged and swallowed. The
 * primary Media write has already committed; a registry blip
 * shouldn't bubble to the user.
 */
export async function upsertTagRegistry(slugs: string[]): Promise<void> {
  if (!slugs || slugs.length === 0) return;

  // Dedupe + drop anything that can't be a slug. parseTag-shape
  // enforcement already happened upstream; this is belt-and-suspenders.
  const unique = Array.from(new Set(slugs.filter((s) => s && s.length > 0)));
  if (unique.length === 0) return;

  try {
    // createMany with skipDuplicates means the INSERT is a single
    // round-trip and conflicts on the unique `slug` index are silently
    // ignored — existing rows keep their bucket assignment, label, and
    // description. New rows default to bucketId=null. Prisma's
    // createMany doesn't return the row ids (we don't need them) so
    // this is the cheapest upsert shape for "ensure exists."
    await prisma.tag.createMany({
      data: unique.map((slug) => ({ slug })),
      skipDuplicates: true,
    });
  } catch (e) {
    console.error("upsertTagRegistry failed", { slugCount: unique.length, e });
  }
}
