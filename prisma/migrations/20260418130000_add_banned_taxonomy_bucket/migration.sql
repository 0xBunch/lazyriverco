-- Gallery v1.4.1 — banned-tag bucket for vision taxonomy.
--
-- Reuses the TaxonomyBucket table (no schema change) with a special
-- `banned` label. Inverse semantics vs. people/places/topics/vibes:
-- slugs here are NEVER emitted, not preferred. Handled in three
-- places:
--   1. src/lib/ai-taxonomy.ts — splits hint into preferred + banned
--      blocks for the Gemini system prompt.
--   2. src/lib/ai-tagging.ts — parseAndCleanTags filters banned
--      slugs from the model's JSON before persisting (backstop for
--      the model occasionally ignoring negative instructions).
--   3. src/app/(portal)/admin/taxonomy/actions.ts — adding a slug
--      to `banned` ALSO runs a retroactive sweep to strip that
--      slug from every Media.tags + Media.aiTags row.
--
-- Idempotent: ON CONFLICT DO NOTHING lets us re-run safely.

INSERT INTO "TaxonomyBucket" ("id", "label", "slugs", "sortOrder", "updatedAt") VALUES
    (gen_random_uuid()::text, 'banned', ARRAY[]::TEXT[], 4, NOW())
ON CONFLICT ("label") DO NOTHING;
