-- prisma+disable-transactions
-- Sports landing — concurrent index on NewsItem(sport, publishedAt DESC).
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so
-- this migration file disables Prisma's transaction wrapper. Plain
-- CREATE INDEX would take SHARE lock on NewsItem and block the 15-min
-- poll-feeds cron writer for the build duration. CONCURRENTLY does the
-- build in two phases without blocking writers, at the cost of running
-- slightly longer wall-time.
--
-- Reviewed by data-integrity-guardian 2026-04-27.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "NewsItem_sport_publishedAt_idx"
  ON "NewsItem" ("sport", "publishedAt" DESC);
