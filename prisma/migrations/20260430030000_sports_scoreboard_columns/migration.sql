-- PR 1 of the sports data layer (2026-04-30). Adds score + game-state
-- columns to SportsScheduleGame so the upcoming Trigger.dev `sync-games`
-- task (PR 2) can write live + final scores from ESPN's hidden API and
-- MLB's statsapi. Also adds season/seasonType/week to future-proof
-- pick'em + week-grouped reads (architect-strategist 2026-04-29 flagged
-- a separate SportsSeason model as cleaner; we accept the simpler
-- shape for lean v1 and migrate later when standings ship).
--
-- All columns are NULLable with no default — existing admin-entered
-- rows backfill to NULL, no row rewrite. The ALTER holds ACCESS
-- EXCLUSIVE for milliseconds; SportsScheduleGame is currently a tiny
-- table (handful of manually-entered tonight rows). Lock timeout
-- mirrors 20260428001000_sponsor_image_fields.
--
-- The new (sport, season, week) index supports the future pick'em
-- query shape `where: { sport: "NFL", season: 2026, week: 12 }`.
-- Built non-concurrently because the table is small; revisit with
-- CREATE INDEX CONCURRENTLY pattern if the table grows past ~10k rows.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

ALTER TABLE "SportsScheduleGame"
  ADD COLUMN "awayScore"  INTEGER,
  ADD COLUMN "homeScore"  INTEGER,
  ADD COLUMN "period"     TEXT,
  ADD COLUMN "clock"      TEXT,
  ADD COLUMN "syncedAt"   TIMESTAMP(3),
  ADD COLUMN "season"     INTEGER,
  ADD COLUMN "seasonType" TEXT,
  ADD COLUMN "week"       INTEGER;

CREATE INDEX "SportsScheduleGame_sport_season_week_idx"
  ON "SportsScheduleGame" ("sport", "season", "week");
