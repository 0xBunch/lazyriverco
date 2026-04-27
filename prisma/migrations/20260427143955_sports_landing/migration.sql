-- Sports landing redesign — foundation migration.
-- See docs/sports-landing-redesign.md for design context.
-- Reviewed by data-integrity-guardian 2026-04-27.
--
-- This file does fast catalog-only operations under Prisma's default
-- transaction wrapper. The CONCURRENTLY index on NewsItem(sport, ...)
-- lives in the sibling _sports_landing_index migration so it can run
-- outside a transaction.

-- Cap how long DDL blocks writers queued behind us. If a long-running
-- transaction holds AccessShare on these tables, fail fast rather than
-- queueing all subsequent writers behind our DDL waiter.
SET lock_timeout      = '3s';
SET statement_timeout = '30s';

-- ── New enums ─────────────────────────────────────────────────────────────
-- IF NOT EXISTS requires PG ≥ 15 (Railway runs 15/16). Idempotency
-- matters: a half-applied migration leaves orphaned types, and a re-run
-- with bare CREATE TYPE fails on duplicate.
CREATE TYPE IF NOT EXISTS "FeedCategory"   AS ENUM ('GENERAL', 'SPORTS');
CREATE TYPE IF NOT EXISTS "SportTag"       AS ENUM ('NFL', 'NBA', 'MLB', 'NHL', 'MLS', 'UFC');
CREATE TYPE IF NOT EXISTS "ScheduleStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED');

-- ── Extend shipped Feed/NewsItem ──────────────────────────────────────────
-- Feed.category NOT NULL DEFAULT 'GENERAL'. PG ≥ 11 stores the default in
-- pg_attribute.attmissingval and synthesizes it for pre-existing tuples
-- — no table rewrite. ACCESS EXCLUSIVE held only for catalog updates
-- (milliseconds). Existing rows become GENERAL retroactively, which is
-- correct: the library feeds shipped pre-this-migration are general-
-- interest by definition.
ALTER TABLE "Feed"     ADD COLUMN "category" "FeedCategory" NOT NULL DEFAULT 'GENERAL';

-- NewsItem.sport is nullable. Pure catalog update; pollFeed's
-- createMany insert (src/lib/feed-poller.ts:307) is unaffected since
-- Prisma's generated type makes new optional columns omittable.
ALTER TABLE "NewsItem" ADD COLUMN "sport" "SportTag";

-- ── New sports tables ─────────────────────────────────────────────────────
CREATE TABLE "SportsWag" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "athleteName"  TEXT NOT NULL,
  "sport"        "SportTag" NOT NULL,
  "team"         TEXT,
  "imageUrl"     TEXT NOT NULL,
  "instagramUrl" TEXT,
  "caption"      VARCHAR(280),
  "hidden"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SportsWag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SportsWag_hidden_idx" ON "SportsWag" ("hidden");

CREATE TABLE "SportsWagFeature" (
  "id"          TEXT NOT NULL,
  "wagId"       TEXT NOT NULL,
  "featureDate" DATE NOT NULL,
  "caption"     VARCHAR(280),
  CONSTRAINT "SportsWagFeature_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SportsWagFeature_wagId_fkey"
    FOREIGN KEY ("wagId") REFERENCES "SportsWag"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SportsWagFeature_featureDate_key" ON "SportsWagFeature" ("featureDate");
CREATE INDEX        "SportsWagFeature_featureDate_idx" ON "SportsWagFeature" ("featureDate");

CREATE TABLE "SportsHighlight" (
  "id"             TEXT NOT NULL,
  "youtubeVideoId" TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "channel"        TEXT NOT NULL,
  "thumbUrl"       TEXT NOT NULL,
  "durationSec"    INTEGER,
  "publishedAt"    TIMESTAMP(3) NOT NULL,
  "sport"          "SportTag" NOT NULL,
  "hidden"         BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SportsHighlight_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SportsHighlight_youtubeVideoId_key"           ON "SportsHighlight" ("youtubeVideoId");
CREATE INDEX        "SportsHighlight_hidden_publishedAt_idx"       ON "SportsHighlight" ("hidden", "publishedAt" DESC);

CREATE TABLE "SportsScheduleGame" (
  "id"          TEXT NOT NULL,
  "sport"       "SportTag" NOT NULL,
  "awayTeam"    TEXT NOT NULL,
  "homeTeam"    TEXT NOT NULL,
  "awayLogoUrl" TEXT,
  "homeLogoUrl" TEXT,
  "gameTime"    TIMESTAMP(3) NOT NULL,
  "network"     TEXT,
  "watchUrl"    TEXT,
  "status"      "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
  "externalId"  TEXT,
  "hidden"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SportsScheduleGame_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SportsScheduleGame_team_distinct"
    CHECK ("homeTeam" <> "awayTeam")
);
-- (sport, externalId) unique. NULLs distinct in PG → admin and synced
-- rows can coexist briefly until PR 4's heuristic merge runs.
CREATE UNIQUE INDEX "SportsScheduleGame_sport_externalId_key"      ON "SportsScheduleGame" ("sport", "externalId");
CREATE INDEX        "SportsScheduleGame_hidden_gameTime_idx"       ON "SportsScheduleGame" ("hidden", "gameTime");
CREATE INDEX        "SportsScheduleGame_sport_gameTime_idx"        ON "SportsScheduleGame" ("sport", "gameTime");
-- Helper for PR 4's heuristic merge.
CREATE INDEX        "SportsScheduleGame_sport_teams_gameTime_idx"  ON "SportsScheduleGame" ("sport", "awayTeam", "homeTeam", "gameTime");

CREATE TABLE "SportsSponsor" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "tagline"      VARCHAR(140),
  "href"         TEXT,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SportsSponsor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SportsSponsor_active_displayOrder_idx" ON "SportsSponsor" ("active", "displayOrder");
