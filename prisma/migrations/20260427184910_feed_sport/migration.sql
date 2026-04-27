-- Add Feed.sport so SPORTS-category feeds can carry a default sport tag.
-- The poller propagates this onto NewsItem.sport at insert time, so
-- per-sport filtering on /sports works without an extra per-item write.
--
-- Nullable, no default. Existing rows keep sport=NULL — correct for
-- GENERAL feeds and acceptable for SPORTS feeds until the admin sets
-- a tag. SportTag enum was created by 20260427143955_sports_landing.
--
-- Pure catalog op: PG holds ACCESS EXCLUSIVE for milliseconds. The
-- 15-min poll-feeds cron's createMany insert (src/lib/feed-poller.ts)
-- continues to work — Prisma's generated type makes new optional
-- columns omittable.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

ALTER TABLE "Feed" ADD COLUMN "sport" "SportTag";
