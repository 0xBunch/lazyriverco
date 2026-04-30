-- WAG provenance + R2 upload path:
--   1) SportsWag.notableFact — short editorial fact, mirrored from
--      PlayerPartnerInfo.notableFact when an admin promotes a
--      WAGFINDER hit. Editable. ≤240 chars to match the WAGFINDER
--      validate() clip().
--   2) SportsWag.sourceUrl — optional whitelisted source link. Same
--      shape PlayerPartnerInfo.sourceUrl uses; rendered as
--      "source · <domain>" on the cover.
--   3) SportsWag.confidence — "low" | "medium" | "high". Default
--      "high" because admin-curated entries are trusted by default;
--      auto-fill + promote paths set this explicitly.
--   4) SportsWag.checkedAt — last verified-by-AI timestamp. NULL for
--      manual admin entries until the next auto-fill / promote.
--   5) SportsWag.imageR2Key — optional R2 object key for permanent
--      copies. The /api/sports/wag/image proxy will prefer the R2
--      public URL when this is set so the editorial cover survives
--      the original source going 404.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

ALTER TABLE "SportsWag"
  ADD COLUMN "notableFact" VARCHAR(240),
  ADD COLUMN "sourceUrl"   TEXT,
  ADD COLUMN "confidence"  TEXT NOT NULL DEFAULT 'high',
  ADD COLUMN "checkedAt"   TIMESTAMP(3),
  ADD COLUMN "imageR2Key"  TEXT;
