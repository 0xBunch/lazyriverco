-- Migration 2 of 2: columns, indexes, CHECK, backfill.
--
-- Depends on the new FeedKind value 'CALENDAR' and the
-- CalendarProviderType enum already existing — added in
-- 20260428190000_calendar_feed_enums (separate migration because
-- ALTER TYPE ... ADD VALUE can't share a tx with statements that
-- USE the new value).
--
-- Adds:
--   Feed.providerType — calendar-only routing discriminator
--   CHECK (kind=CALENDAR ⇔ providerType IS NOT NULL)
--   CalendarEntry.feedId — FK back to Feed, onDelete SET NULL
--   index on CalendarEntry.feedId
--
-- Backfills:
--   4 Feed rows for the existing hardcoded calendar providers
--   (Nager, USNO Moon, USNO Seasons, ESPN NFL), owned by the oldest
--   ADMIN user.
--   CalendarEntry.feedId on previously-synced rows, joined via the
--   existing source string.
--
-- Locks: ALTER TABLE on small tables (~100 rows total). ACCESS
-- EXCLUSIVE held for ms. lock_timeout caps the wait at 3s.
--
-- Rollback: forward-only. To unwind, delete the seeded Feed rows
-- (`DELETE FROM "Feed" WHERE "providerType" IS NOT NULL`), drop
-- column "providerType", drop FK + column "feedId". The CALENDAR
-- enum value can't be cleanly dropped from FeedKind without
-- recreating the type — leave it.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

-- Feed.providerType + invariant
ALTER TABLE "Feed"
  ADD COLUMN "providerType" "CalendarProviderType",
  ADD CONSTRAINT "Feed_calendar_provider_check"
    CHECK (("kind" = 'CALENDAR') = ("providerType" IS NOT NULL));

-- CalendarEntry.feedId
ALTER TABLE "CalendarEntry"
  ADD COLUMN "feedId" TEXT;

ALTER TABLE "CalendarEntry"
  ADD CONSTRAINT "CalendarEntry_feedId_fkey"
    FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CalendarEntry_feedId_idx" ON "CalendarEntry" ("feedId");

-- Backfill: insert Feed rows for the four built-in calendar providers,
-- then update CalendarEntry.feedId from existing source strings.
DO $$
DECLARE admin_id TEXT;
DECLARE inserted_count INT;
BEGIN
  SELECT id INTO admin_id
    FROM "User"
    WHERE role = 'ADMIN'
    ORDER BY "createdAt" ASC
    LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'No ADMIN user found — cannot seed built-in calendar feed rows';
  END IF;

  -- ON CONFLICT (url) DO NOTHING — re-running this migration (e.g.
  -- after a partial failure) shouldn't double-insert. Feed.url is
  -- @unique. The {yr} placeholder URLs are deliberate: admin sees the
  -- canonical pattern, provider code substitutes the current year at
  -- fetch time. Built-in handlers do NOT call assertUrlSafePublic on
  -- feed.url — they construct the real URL and validate that one.
  --
  -- The four URL strings below MUST match BUILT_IN_CALENDAR_URLS in
  -- src/lib/calendar-providers/built-in-urls.ts. That module is the
  -- forward-looking source of truth (migrations are forward-only);
  -- this INSERT is the historical seed. If a URL convention changes
  -- in built-in-urls.ts, write a follow-up migration that UPDATEs the
  -- corresponding rows.
  INSERT INTO "Feed" (
    "id", "name", "url", "kind", "providerType",
    "category", "pollIntervalMin", "ownerId",
    "createdAt", "updatedAt"
  ) VALUES
    (
      gen_random_uuid(),
      'Nager — US Holidays',
      'https://date.nager.at/api/v3/PublicHolidays/{yr}/US',
      'CALENDAR', 'NAGER', 'GENERAL', 1440, admin_id,
      NOW(), NOW()
    ),
    (
      gen_random_uuid(),
      'USNO — Moon Phases',
      'https://aa.usno.navy.mil/api/moon/phases/year?year={yr}',
      'CALENDAR', 'USNO_MOON', 'GENERAL', 1440, admin_id,
      NOW(), NOW()
    ),
    (
      gen_random_uuid(),
      'USNO — Seasons',
      'https://aa.usno.navy.mil/api/seasons?year={yr}',
      'CALENDAR', 'USNO_SEASON', 'GENERAL', 1440, admin_id,
      NOW(), NOW()
    ),
    (
      gen_random_uuid(),
      'ESPN — NFL Schedule',
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
      'CALENDAR', 'ESPN_NFL', 'GENERAL', 360, admin_id,
      NOW(), NOW()
    )
  ON CONFLICT ("url") DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Seeded % built-in calendar feed rows', inserted_count;
END $$;

-- Backfill CalendarEntry.feedId on rows that came from the hardcoded
-- providers in PR #109. WHERE syncedAt IS NOT NULL is explicit even
-- though manual rows have source = NULL (the join would skip them
-- anyway) — makes intent loud for future maintainers.
UPDATE "CalendarEntry" ce
SET "feedId" = f.id
FROM "Feed" f
WHERE ce."syncedAt" IS NOT NULL
  AND f."providerType" IS NOT NULL
  AND ce."source" = CASE f."providerType"
        WHEN 'NAGER'       THEN 'nager-us'
        WHEN 'USNO_MOON'   THEN 'usno-moon'
        WHEN 'USNO_SEASON' THEN 'usno-season'
        WHEN 'ESPN_NFL'    THEN 'espn-nfl'
      END;
