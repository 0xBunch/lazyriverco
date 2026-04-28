-- Living-calendar feeds. Adds three columns + a composite unique index to
-- CalendarEntry so cron-driven providers (Nager holidays, USNO astronomy,
-- ESPN sports) can upsert events alongside hand-curated entries without
-- colliding.
--
-- Dedupe model:
--   (source, externalId) is the upsert key for synced rows:
--     "nager-us"  + "2026-12-25-christmas-day"  → US Christmas 2026
--     "usno-moon" + "2026-05-31-full-moon"      → May 2026 full moon
--     "espn-nfl"  + "day-2026-09-13"            → NFL Sunday rollup
--   Manual entries leave both columns NULL — Postgres treats NULLs as
--   distinct in unique indexes, so manual entries never conflict with
--   each other or with synced ones.
--
-- All three new columns are NULL-able with no default → catalog op,
-- no row rewrite. CalendarEntry is small (~50 rows) so non-CONCURRENTLY
-- index creation is fine; ACCESS EXCLUSIVE held for milliseconds.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

ALTER TABLE "CalendarEntry"
  ADD COLUMN "source"     TEXT,
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "syncedAt"   TIMESTAMP(3);

CREATE UNIQUE INDEX "CalendarEntry_source_externalId_key"
  ON "CalendarEntry" ("source", "externalId");

CREATE INDEX "CalendarEntry_source_idx"
  ON "CalendarEntry" ("source");
