-- Add NewsItem.tags for editorial tagging on /sports/news.
--
-- text[] DEFAULT '{}' is a constant default → PG ≥ 11 fast-default,
-- no table rewrite. Existing rows materialize as empty arrays at
-- read time via attmissingval.
--
-- GIN index supports the `tags @> ARRAY['NFL']` filter the
-- /sports/news page uses; created CONCURRENTLY in a sibling migration
-- so it doesn't block writers (the poll-feeds cron writes to NewsItem
-- every 15 min). Pattern matches the data-integrity-guardian fix on
-- the prior NewsItem.sport index.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

ALTER TABLE "NewsItem" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
