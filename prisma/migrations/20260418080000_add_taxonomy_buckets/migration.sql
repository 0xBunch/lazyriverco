-- Gallery v1.4 — controlled-vocabulary hints for Gemini vision tagging.
--
-- One row per semantic bucket. `buildTaxonomyHint()` in
-- src/lib/ai-taxonomy.ts reads these at call time (process-cached 60s)
-- and concatenates non-empty buckets into the system instruction.
-- Admin edits via /admin/taxonomy — see src/app/(portal)/admin/taxonomy/.
--
-- Seeds the four initial buckets (people / places / topics / vibes) as
-- empty arrays so the admin page renders all four rows on first load
-- without a "no data" empty-state. `ON CONFLICT DO NOTHING` keeps the
-- migration idempotent if re-run against a DB that already has any of
-- these labels.

CREATE TABLE "TaxonomyBucket" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxonomyBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxonomyBucket_label_key" ON "TaxonomyBucket"("label");
CREATE INDEX "TaxonomyBucket_sortOrder_idx" ON "TaxonomyBucket"("sortOrder");

INSERT INTO "TaxonomyBucket" ("id", "label", "slugs", "sortOrder", "updatedAt") VALUES
    (gen_random_uuid()::text, 'people', ARRAY[]::TEXT[], 0, NOW()),
    (gen_random_uuid()::text, 'places', ARRAY[]::TEXT[], 1, NOW()),
    (gen_random_uuid()::text, 'topics', ARRAY[]::TEXT[], 2, NOW()),
    (gen_random_uuid()::text, 'vibes',  ARRAY[]::TEXT[], 3, NOW())
ON CONFLICT ("label") DO NOTHING;
