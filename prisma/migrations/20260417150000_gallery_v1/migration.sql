-- Gallery v1 — open the media bank to all members, add URL-ingestion
-- metadata, Postgres full-text search, and the substrate for the agent
-- `gallery_search` tool. See /Users/bunch/.claude/plans/okay-so-i-m-going-wild-hanrahan.md
--
-- Order inside this file is deliberate:
--   1. Create MediaOrigin enum (referenced by the new Media.origin column).
--   2. Add the new Media columns. `origin` gets NOT NULL DEFAULT 'UPLOAD'
--      so every pre-existing row lands in a valid bucket immediately.
--   3. Backfill `origin` from the existing free-string `type` column so
--      pre-v1 rows get their correct origin (YouTube / IG / X / Web)
--      instead of defaulting all to UPLOAD.
--   4. Backfill `storedLocally` — previous uploads (type in image/video)
--      were direct uploads to R2; everything else only referenced remote
--      URLs.
--   5. IMMUTABLE SQL wrapper function `media_search_tsv(...)` that calls
--      to_tsvector('english', ...). Postgres classifies the built-in
--      to_tsvector as STABLE (the text search config is looked up at
--      call time), which blocks BOTH stored-generated columns AND
--      expression indexes. The canonical Postgres FTS idiom is an
--      IMMUTABLE wrapper — the config is effectively fixed in our
--      deployment and the wrapper is safe.
--   6. Functional GIN index on media_search_tsv(...) for full-text
--      search. Callers (UI + agent tool) must use the same function
--      call in WHERE to hit this index — see src/lib/gallery-search.ts.
--   7. (origin, status, createdAt) composite index for grid read path.

-- CreateEnum
CREATE TYPE "MediaOrigin" AS ENUM ('UPLOAD', 'INSTAGRAM', 'YOUTUBE', 'X', 'WEB');

-- AlterTable
ALTER TABLE "Media"
    ADD COLUMN "origin" "MediaOrigin" NOT NULL DEFAULT 'UPLOAD',
    ADD COLUMN "originTitle" TEXT,
    ADD COLUMN "originAuthor" TEXT,
    ADD COLUMN "storedLocally" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "embedHtml" TEXT,
    ADD COLUMN "ogImageUrl" TEXT,
    ADD COLUMN "hiddenFromGrid" BOOLEAN NOT NULL DEFAULT false;

-- Backfill origin from the pre-v1 free-string type column so existing rows
-- land in the right bucket for grid treatment + agent filters.
UPDATE "Media" SET "origin" = CASE
    WHEN "type" = 'youtube'          THEN 'YOUTUBE'::"MediaOrigin"
    WHEN "type" = 'instagram'        THEN 'INSTAGRAM'::"MediaOrigin"
    WHEN "type" = 'tweet'            THEN 'X'::"MediaOrigin"
    WHEN "type" IN ('image','video') THEN 'UPLOAD'::"MediaOrigin"
    ELSE                                  'WEB'::"MediaOrigin"
END;

-- Rows with type in image/video were direct uploads to R2 — they're
-- already stored locally. Everything else pre-v1 was a raw external URL.
UPDATE "Media" SET "storedLocally" = true
    WHERE "type" IN ('image','video');

-- IMMUTABLE wrapper for to_tsvector — standard Postgres FTS idiom. The
-- built-in is STABLE (looks up default_text_search_config), which blocks
-- generated columns AND expression indexes. By wrapping with the config
-- hard-coded, we promise IMMUTABLE behavior. If a later migration wants
-- to change the search config, drop the dependent index first.
CREATE OR REPLACE FUNCTION media_search_tsv(
    caption      text,
    originTitle  text,
    originAuthor text,
    tags         text[]
) RETURNS tsvector
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT to_tsvector('english'::regconfig,
        coalesce(caption, '') || ' ' ||
        coalesce(originTitle, '') || ' ' ||
        coalesce(originAuthor, '') || ' ' ||
        array_to_string(tags, ' '))
$$;

-- Functional GIN index — callers MUST invoke media_search_tsv() with the
-- same four args in WHERE so the planner uses this index.
CREATE INDEX "Media_searchExpr_idx" ON "Media" USING GIN (
    media_search_tsv("caption", "originTitle", "originAuthor", "tags")
);

-- CreateIndex — grid read path (filter by origin + status, order by recency).
CREATE INDEX "Media_origin_status_createdAt_idx" ON "Media"("origin", "status", "createdAt" DESC);
