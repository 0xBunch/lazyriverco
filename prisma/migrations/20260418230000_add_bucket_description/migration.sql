-- Optional prose rule on TaxonomyBucket.
--
-- Presence of a non-empty description makes a bucket "priority":
--   * Gemini vision prompt bumps it into a "scan for these specifically"
--     block (see src/lib/ai-taxonomy.ts renderHint).
--   * The /admin/taxonomy "Classify uncategorized" admin action only
--     writes into priority buckets; everything else stays bucketId=null
--     by design (generic descriptors earn their keep as Media recall
--     tags without polluting the curated buckets).
--
-- Additive + nullable — no backfill, brief DDL lock only. Every existing
-- bucket becomes a "secondary" bucket by default, which matches the
-- v1 behavior (no curated description => no priority treatment).

ALTER TABLE "TaxonomyBucket" ADD COLUMN "description" TEXT;
