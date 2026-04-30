-- WAG integration foundation (split-rename, deploy-1 of 2):
--   1) New Athlete table — canonical cross-sport athlete record.
--      Optional FK to SleeperPlayer for NFL athletes that already
--      exist in our Sleeper mirror. Optional FK from SportsWag.
--      Includes a partial unique index for the team-IS-NULL case so
--      concurrent inserts can't create duplicate Athletes (Postgres
--      treats NULL as distinct in regular unique indexes).
--   2) SportsWag.instagramHandle — ADD ONLY. The legacy
--      `instagramUrl` column stays in place during this deploy so the
--      previously-deployed code that reads/writes it keeps working
--      while the new container takes over. Best-effort backfill
--      extracts a handle from common instagram.com URL shapes.
--      Anything that doesn't match the handle regex stays NULL on
--      `instagramHandle` but the original `instagramUrl` value is
--      preserved untouched as the recovery lifeline.
--
-- A follow-up migration (deploy-2) drops `instagramUrl` once no
-- live readers remain. See PR review notes from data-migration-expert.
-- Reviewed alongside the Track A integration changes.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

-- ── Athlete table ─────────────────────────────────────────────────────────
CREATE TABLE "Athlete" (
  "id"              TEXT        NOT NULL,
  "fullName"        TEXT        NOT NULL,
  "sport"           "SportTag"  NOT NULL,
  "team"            TEXT,
  "sleeperPlayerId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Athlete_sleeperPlayerId_fkey"
    FOREIGN KEY ("sleeperPlayerId") REFERENCES "SleeperPlayer"("playerId")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Athlete_sleeperPlayerId_key"
  ON "Athlete" ("sleeperPlayerId");
-- Same person on the same team in the same sport is the same athlete.
-- Postgres treats NULL as distinct in regular unique indexes — so two
-- rows with team=NULL and identical (fullName, sport) won't collide
-- against the (fullName, sport, team) index. The partial unique index
-- below closes that gap for team-IS-NULL rows. resolveAthleteId() in
-- /admin/sports/wags/actions.ts must catch P2002 from EITHER index and
-- re-run findFirst to handle the concurrent-insert race.
CREATE UNIQUE INDEX "Athlete_fullName_sport_team_key"
  ON "Athlete" ("fullName", "sport", "team");
CREATE UNIQUE INDEX "Athlete_fullName_sport_null_team_key"
  ON "Athlete" ("fullName", "sport") WHERE "team" IS NULL;
CREATE INDEX "Athlete_sport_idx"     ON "Athlete" ("sport");
CREATE INDEX "Athlete_fullName_idx"  ON "Athlete" ("fullName");

-- ── SportsWag.athleteId ────────────────────────────────────────────────────
-- Nullable for now. scripts/backfill-sports-wag-athletes.ts upserts
-- one Athlete per existing SportsWag (athleteName, sport, team) tuple
-- and links them. A follow-up migration tightens athleteId to NOT NULL
-- after the backfill has run against prod.
ALTER TABLE "SportsWag"
  ADD COLUMN "athleteId" TEXT;

ALTER TABLE "SportsWag"
  ADD CONSTRAINT "SportsWag_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SportsWag_athleteId_idx" ON "SportsWag" ("athleteId");

-- ── SportsWag.instagramHandle (ADD ONLY, dual-column transition) ───────────
-- Add the new column and backfill from `instagramUrl`. The legacy column
-- stays in place so the previously-deployed code that reads it keeps
-- working through the deploy window. A follow-up migration drops
-- `instagramUrl` once the new code is fully live and no live readers
-- remain.
ALTER TABLE "SportsWag"
  ADD COLUMN "instagramHandle" TEXT;

-- Best-effort handle extraction from the legacy free-form column.
-- Cases the regex covers (case-insensitive):
--   https://instagram.com/foo
--   https://www.instagram.com/foo/
--   https://instagram.com/foo?utm=...
--   instagram.com/foo
--   foo                    (already a bare handle)
-- After extraction we lowercase and run the same shape check
-- sanitizeInstagramHandle uses: 1-30 chars, [a-z0-9_.], no leading/
-- trailing dot, no consecutive dots, not all dots. Anything that
-- doesn't match stays NULL.
WITH extracted AS (
  SELECT
    "id",
    LOWER(
      TRIM(
        BOTH '/' FROM
        SPLIT_PART(
          SPLIT_PART(
            REGEXP_REPLACE(
              COALESCE("instagramUrl", ''),
              '^(?:https?://)?(?:www\.)?instagram\.com/',
              '',
              'i'
            ),
            '?', 1
          ),
          '/', 1
        )
      )
    ) AS candidate
  FROM "SportsWag"
)
UPDATE "SportsWag" sw
SET "instagramHandle" = e.candidate
FROM extracted e
WHERE sw."id" = e."id"
  AND e.candidate ~ '^[a-z0-9_.]{1,30}$'
  AND e.candidate !~ '^\.'
  AND e.candidate !~ '\.$'
  AND e.candidate !~ '\.\.'
  AND e.candidate !~ '^\.+$';

-- NOTE: `instagramUrl` deliberately retained. It is dropped in a later
-- migration once the new code is verified live and reading from
-- `instagramHandle` exclusively. The original URL is the recovery
-- lifeline if the regex extraction was lossy.
