-- One-time cleanup of Nager-sourced CalendarEntry rows.
--
-- PR-after-#114 changed two things in src/lib/calendar-providers/nager.ts:
--   1. Federal holidays with literal-fixed dates (Independence Day,
--      New Year's Day, Juneteenth, Veterans Day, Christmas Day) are
--      now snapped to their canonical MM-DD instead of using Nager's
--      observance-shifted date. Was producing "Independence Day on
--      Fri Jul 3 2026" (federal observance because Sat Jul 4 falls
--      on weekend); now produces "Independence Day on Sat Jul 4."
--   2. externalId scheme switched from `${date}-${slug(name)}` to
--      `${year}-${slug(name)}` so future date corrections update the
--      row in place instead of orphaning it.
--
-- Both changes mean the existing Nager rows from the original PR #109
-- backfill have stale externalIds. Simplest cleanup: delete them all
-- and let the next /api/cron/poll-feeds tick repopulate via the new
-- code path. ~20 rows deleted; the next cron tick (within 15 min of
-- deploy) re-inserts them with correct dates + stable IDs.
--
-- This is forward-only and safe: source='nager-us' rows are
-- 100% cron-managed, never user-curated, so no risk of losing
-- user input. CalendarEntry.feedId on the Nager Feed row is unchanged.

DELETE FROM "CalendarEntry"
  WHERE "source" = 'nager-us';
