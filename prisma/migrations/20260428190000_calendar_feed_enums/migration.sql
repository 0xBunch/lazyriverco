-- Migration 1 of 2: enum types only.
--
-- Postgres won't let you USE a newly-added enum value in the same
-- transaction it was added in (`ERROR: unsafe use of new value`).
-- Prisma wraps every migration.sql in a tx by default, so the enum
-- ADD must run alone before the next migration's INSERTs reference it.
-- Migration 2 (20260428190100_calendar_feeds_unified) does the column
-- adds, CHECK constraint, and backfill INSERTs.
--
-- Both statements are catalog-only ops — ms-level locks, no row rewrites.

ALTER TYPE "FeedKind" ADD VALUE IF NOT EXISTS 'CALENDAR';

CREATE TYPE "CalendarProviderType" AS ENUM (
  'NAGER',
  'USNO_MOON',
  'USNO_SEASON',
  'ESPN_NFL',
  'ICAL_URL'
);
