-- Gallery v1.3 — Gemini vision auto-tagging fields on Media.
--
-- Three new columns, all nullable or defaulted so existing rows land
-- safely:
--   aiTags         — separate array from `tags` so admin can distinguish
--                    AI-applied from human-applied tags and reprocess.
--   aiAnalyzedAt   — timestamp of last run; null = never analyzed.
--   aiAnalysisNote — null on success, "skipped: …" / "failed: …" otherwise.
--
-- No index on aiAnalyzedAt — at 7 users with on-the-order-of hundreds of
-- rows, any backfill sweeper can seq-scan filtered by `IS NULL`. Add an
-- index later if a reprocess queue ever gets busy.

-- AlterTable
ALTER TABLE "Media"
    ADD COLUMN "aiTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "aiAnalyzedAt" TIMESTAMP(3),
    ADD COLUMN "aiAnalysisNote" TEXT;
