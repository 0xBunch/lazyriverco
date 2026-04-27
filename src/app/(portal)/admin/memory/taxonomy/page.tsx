import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { TagRegistry, type BucketOption, type TagRow } from "./TagRegistry";

// /admin/memory/taxonomy (v1.5) — tag registry admin.
//
// Every slug that appears in Media.tags, Media.aiTags, or was curated
// via this page has a row in the Tag table. The page shows EVERY tag
// with its use count and bucket, so the admin never has to hunt on
// individual library items to find what needs cleaning up.
//
// Usage counts are computed on demand via one UNNEST aggregation query
// — not denormalized. At this scale (< 1k Media rows), the query is
// sub-10ms and avoids the drift that plagued the v1.3 slugs[] model.

export const dynamic = "force-dynamic";

type UseCountRow = { slug: string; uses: bigint };

export default async function AdminTaxonomyPage() {
  await requireAdmin();

  const [buckets, tags, useCounts] = await Promise.all([
    prisma.taxonomyBucket.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        label: true,
        sortOrder: true,
        description: true,
      },
    }),
    prisma.tag.findMany({
      orderBy: [{ slug: "asc" }],
      select: {
        slug: true,
        label: true,
        description: true,
        bucketId: true,
        updatedAt: true,
      },
    }),
    // UNION across both columns so we count a tag once per media row
    // even if it lives in both tags + aiTags. COUNT returns bigint in
    // Postgres; Number() coerces — safe up to 2^53-1, i.e. ~9e15 uses
    // per tag, which is… fine. Stays as bigint in the typed row so
    // the coercion site below is the single canonical conversion.
    prisma.$queryRaw<UseCountRow[]>`
      SELECT slug, COUNT(*)::bigint AS uses
      FROM (
        SELECT id, UNNEST("tags") AS slug FROM "Media"
        UNION
        SELECT id, UNNEST("aiTags") AS slug FROM "Media"
      ) m
      GROUP BY slug
    `,
  ]);

  const countBySlug = new Map<string, number>();
  for (const row of useCounts) {
    countBySlug.set(row.slug, Number(row.uses));
  }

  const bucketOptions: BucketOption[] = buckets.map((b) => ({
    id: b.id,
    label: b.label,
    description: b.description,
  }));

  const rows: TagRow[] = tags.map((t) => ({
    slug: t.slug,
    label: t.label,
    description: t.description,
    bucketId: t.bucketId,
    bucketLabel:
      buckets.find((b) => b.id === t.bucketId)?.label ?? null,
    uses: countBySlug.get(t.slug) ?? 0,
  }));

  // Defensive: if a slug lives in Media.tags but isn't in the Tag
  // registry, that's a drift bug (every write path should upsert via
  // tag-registry.ts). Don't silently hide it from the admin — synthesize
  // a virtual row AND log a warning so the breadcrumb lands in Railway
  // logs. The right fix when this fires is to trace which write path
  // skipped upsertTagRegistry.
  const registeredSlugs = new Set(tags.map((t) => t.slug));
  const drifted: string[] = [];
  for (const [slug, uses] of countBySlug.entries()) {
    if (!registeredSlugs.has(slug)) {
      drifted.push(slug);
      rows.push({
        slug,
        label: null,
        description: null,
        bucketId: null,
        bucketLabel: null,
        uses,
      });
    }
  }
  if (drifted.length > 0) {
    console.warn(
      "[admin/taxonomy] Tag registry drift — slugs in Media.tags without a Tag row:",
      drifted.slice(0, 10),
      drifted.length > 10 ? `(and ${drifted.length - 10} more)` : "",
    );
  }
  rows.sort((a, b) => a.slug.localeCompare(b.slug));

  const totalUses = rows.reduce((sum, r) => sum + r.uses, 0);
  const uncategorized = rows.filter((r) => r.bucketId === null).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
          Tag registry
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-bone-300 text-pretty">
          Every tag that exists anywhere in the library. {rows.length} tag
          {rows.length === 1 ? "" : "s"} across {buckets.length} bucket
          {buckets.length === 1 ? "" : "s"}, {totalUses} total uses,{" "}
          {uncategorized} uncategorized. Edit a tag to add a description,
          reassign buckets, or ban it. Bulk-paste slugs at the top to seed
          a bucket fast.
        </p>
      </header>

      <TagRegistry buckets={bucketOptions} rows={rows} />

      <p className="text-xs italic text-bone-400">
        Bucket reassignments take effect on the next Gemini call
        (~instant on this server, ≤60 s cluster-wide via cache TTL).
        Reassigning into banned also strips the slug from every library
        item. Existing items aren&apos;t retroactively re-tagged when a
        tag joins a preferred bucket — trigger a re-analyze from
        /admin/memory/library or <code>pnpm backfill:ai-tags</code> for that.
      </p>
    </div>
  );
}

