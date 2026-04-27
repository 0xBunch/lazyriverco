-- prisma+disable-transactions
-- GIN index on NewsItem.tags. CREATE INDEX CONCURRENTLY can't run
-- inside a transaction, so this migration disables Prisma's wrapper.
-- Plain CREATE INDEX would take SHARE lock and block the 15-min
-- poll-feeds cron writer for the build duration.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "NewsItem_tags_idx"
  ON "NewsItem" USING GIN ("tags");
