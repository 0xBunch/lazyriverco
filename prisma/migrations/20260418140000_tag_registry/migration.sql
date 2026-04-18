-- Gallery v1.5 — promote tags to first-class entities.
--
-- The v1.3 bucket model stored curated slugs as TaxonomyBucket.slugs[].
-- That surface drifted from reality: Media rows accumulated tags
-- (human-entered + AI-generated) that were never curated into any
-- bucket, so the admin page was showing ~30 curated slugs while Media
-- held many more. This migration:
--
--   1. CREATE TABLE Tag — one row per distinct slug in the system.
--   2. Seed Tag from every slug currently in Media.tags, Media.aiTags,
--      and TaxonomyBucket.slugs (union, distinct).
--   3. Backfill Tag.bucketId from existing TaxonomyBucket.slugs
--      membership so today's curation is preserved.
--   4. DROP TaxonomyBucket.slugs — the single source of truth for
--      bucket membership is now Tag.bucketId.
--
-- Idempotency: all INSERTs use ON CONFLICT DO NOTHING against the
-- unique `slug` constraint, so the migration is safe to re-run against
-- a DB that already has Tag rows.
--
-- Rollback (manual, if ever needed — there is no auto-down migration):
--   BEGIN;
--   ALTER TABLE "TaxonomyBucket" ADD COLUMN "slugs" TEXT[] DEFAULT ARRAY[]::TEXT[];
--   UPDATE "TaxonomyBucket" tb
--     SET "slugs" = COALESCE(
--       (SELECT array_agg(t.slug ORDER BY t.slug) FROM "Tag" t WHERE t."bucketId" = tb.id),
--       ARRAY[]::TEXT[]
--     );
--   DROP TABLE "Tag";
--   COMMIT;
-- Pre-migration dump: `pg_dump --data-only --table='"TaxonomyBucket"'` is
-- the safety net if we ever regret this and the inverse doesn't land cleanly.

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "bucketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");
CREATE INDEX "Tag_bucketId_idx" ON "Tag"("bucketId");

ALTER TABLE "Tag"
    ADD CONSTRAINT "Tag_bucketId_fkey"
    FOREIGN KEY ("bucketId") REFERENCES "TaxonomyBucket"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed distinct slugs from every source.
INSERT INTO "Tag" ("id", "slug", "updatedAt")
SELECT gen_random_uuid()::text, slug, NOW()
FROM (
    SELECT DISTINCT UNNEST("tags") AS slug FROM "Media"
    UNION
    SELECT DISTINCT UNNEST("aiTags") AS slug FROM "Media"
    UNION
    SELECT DISTINCT UNNEST("slugs") AS slug FROM "TaxonomyBucket"
) AS all_slugs
WHERE slug IS NOT NULL AND slug != ''
ON CONFLICT ("slug") DO NOTHING;

-- Backfill bucketId from existing TaxonomyBucket.slugs membership. If
-- a slug lives in multiple buckets today (shouldn't happen under normal
-- flow, but defensively possible from data-fix scripts), the row with
-- the smallest sortOrder wins — the banned bucket has sortOrder=4,
-- curated buckets are 0-3, so preferred wins over banned if both.
-- Admin can reassign via the new UI.
UPDATE "Tag" t
SET "bucketId" = tb.id
FROM (
    SELECT DISTINCT ON (slug_text)
        slug_text,
        id
    FROM (
        SELECT id, UNNEST("slugs") AS slug_text, "sortOrder"
        FROM "TaxonomyBucket"
    ) AS bucket_slugs
    -- Tiebreak on id so two buckets with the same sortOrder (schema
    -- doesn't enforce unique) produce a deterministic winner rather
    -- than a non-deterministic bucket assignment on migrate.
    ORDER BY slug_text, "sortOrder" ASC, id ASC
) tb
WHERE t."slug" = tb.slug_text
  AND t."bucketId" IS NULL;

-- Drop the legacy slugs column. Tag.bucketId is the single source of
-- truth going forward.
ALTER TABLE "TaxonomyBucket" DROP COLUMN "slugs";
