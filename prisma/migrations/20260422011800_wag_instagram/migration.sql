-- WAGFINDER: add optional Instagram handle column. Nullable so existing
-- rows don't break; Gemini extracts on the next re-roll click when the
-- user wants the handle on a previously-found WAG.

BEGIN;

ALTER TABLE "PlayerPartnerInfo"
  ADD COLUMN "instagramHandle" TEXT;

COMMIT;
