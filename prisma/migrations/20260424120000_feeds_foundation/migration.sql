-- Feeds foundation: automated-ingestion schema (Feed + NewsItem +
-- FeedPollLog) plus additive columns on Media and User.
--
-- This is the invisible-foundation migration behind the library news
-- + automated feeds plan — PR A1. No admin UI yet (that's PR B); no
-- cron wiring yet either. Landing the schema now unblocks both the
-- poller library (src/lib/feed-poller.ts) and the health lib
-- (src/lib/feed-health.ts) that ship in this same PR.
--
-- Full context + PR decomposition: /Users/bunch/.claude/plans/library-news-and-feeds.md
--
-- Safety shape:
--   * All changes are ADDITIVE. No column drops, no renames, no
--     destructive ALTERs.
--   * Media.feedId is nullable — every existing Media row gets NULL
--     on first read; no backfill required.
--   * User.betaFeatures defaults to empty array — existing users
--     become opted-out of all beta features by default.
--   * Feeds starts empty; no seed rows inserted.
--   * CHECK constraints on Feed (url shape + poll interval window)
--     are enforced on INSERT but empty table at migration time = no
--     risk of pre-existing rows violating them.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enum: FeedKind
-- ---------------------------------------------------------------------------

CREATE TYPE "FeedKind" AS ENUM ('NEWS', 'MEDIA');

-- ---------------------------------------------------------------------------
-- Table: Feed
--
-- Primary polled-source record. Ownership FK uses ON DELETE RESTRICT on
-- purpose: deleting a user that owns live feeds should force an
-- explicit reassign in the admin UI, not silently null the owner or
-- cascade-delete the feed (which would take its poll history with it).
-- ---------------------------------------------------------------------------

CREATE TABLE "Feed" (
    "id"                      TEXT         NOT NULL,
    "name"                    TEXT         NOT NULL,
    "url"                     TEXT         NOT NULL,
    "kind"                    "FeedKind"   NOT NULL,
    "enabled"                 BOOLEAN      NOT NULL DEFAULT true,
    "pollIntervalMin"         INTEGER      NOT NULL DEFAULT 30,
    "ownerId"                 TEXT         NOT NULL,
    "lastPolledAt"            TIMESTAMP(3),
    "nextPollEligibleAt"      TIMESTAMP(3),
    "lastSuccessAt"           TIMESTAMP(3),
    "lastItemAt"              TIMESTAMP(3),
    "lastError"               VARCHAR(2000),
    "consecutivePollFailures" INTEGER      NOT NULL DEFAULT 0,
    "autoDisabledAt"          TIMESTAMP(3),
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Feed_url_key" ON "Feed"("url");

-- URL shape guard. Both http and https admitted because some internal
-- test feeds will be http; safeFetch will gate egress at poll time.
ALTER TABLE "Feed"
    ADD CONSTRAINT "Feed_url_shape"
    CHECK ("url" ~* '^https?://.+');

-- Poll-interval sanity gate: 5 min (avoid hammering upstream RSS) up
-- to 24 hours (anything rarer belongs in a digest, not a poll).
ALTER TABLE "Feed"
    ADD CONSTRAINT "Feed_poll_interval"
    CHECK ("pollIntervalMin" BETWEEN 5 AND 1440);

ALTER TABLE "Feed"
    ADD CONSTRAINT "Feed_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Table: NewsItem
--
-- One row per RSS entry from a NEWS-kind feed. sourceUrl is the
-- normalized canonical URL (src/lib/feed-types.ts: normalizeUrl) and
-- the global dedupe key; (feedId, guid) is the secondary dedup. The
-- keyset-pagination index on (publishedAt DESC, id DESC) is why the
-- /news page can scroll without OFFSET.
-- ---------------------------------------------------------------------------

CREATE TABLE "NewsItem" (
    "id"          TEXT         NOT NULL,
    "feedId"      TEXT         NOT NULL,
    "sourceUrl"   TEXT         NOT NULL,
    "originalUrl" TEXT         NOT NULL,
    "guid"        TEXT,
    "title"       TEXT         NOT NULL,
    "excerpt"     TEXT,
    "author"      TEXT,
    "publishedAt" TIMESTAMP(3),
    "ingestedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ogImageUrl"  TEXT,
    "hidden"      BOOLEAN      NOT NULL DEFAULT false,
    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsItem_sourceUrl_key"
    ON "NewsItem"("sourceUrl");

CREATE INDEX "NewsItem_publishedAt_id_idx"
    ON "NewsItem"("publishedAt" DESC, "id" DESC);

CREATE INDEX "NewsItem_feedId_publishedAt_idx"
    ON "NewsItem"("feedId", "publishedAt" DESC);

CREATE UNIQUE INDEX "NewsItem_feedId_guid_key"
    ON "NewsItem"("feedId", "guid");

ALTER TABLE "NewsItem"
    ADD CONSTRAINT "NewsItem_feedId_fkey"
    FOREIGN KEY ("feedId") REFERENCES "Feed"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Table: FeedPollLog
--
-- Append-only poll-history log. Retention: 14 days, enforced by the
-- prune cron that ships in PR B. Outcome is a text column (not enum)
-- because the PollOutcome union in src/lib/feed-types.ts can evolve
-- without a migration.
-- ---------------------------------------------------------------------------

CREATE TABLE "FeedPollLog" (
    "id"         TEXT         NOT NULL,
    "feedId"     TEXT         NOT NULL,
    "startedAt"  TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER      NOT NULL,
    "outcome"    TEXT         NOT NULL,
    "inserted"   INTEGER      NOT NULL DEFAULT 0,
    "skipped"    INTEGER      NOT NULL DEFAULT 0,
    "errors"     JSONB,
    CONSTRAINT "FeedPollLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedPollLog_feedId_startedAt_idx"
    ON "FeedPollLog"("feedId", "startedAt" DESC);

CREATE INDEX "FeedPollLog_outcome_startedAt_idx"
    ON "FeedPollLog"("outcome", "startedAt" DESC);

ALTER TABLE "FeedPollLog"
    ADD CONSTRAINT "FeedPollLog_feedId_fkey"
    FOREIGN KEY ("feedId") REFERENCES "Feed"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Additive: Media.feedId (nullable FK to Feed)
--
-- MEDIA-kind feeds drop their ingested items into the existing Media
-- table rather than a parallel table. feedId marks provenance; the
-- /library grid defaults to hiding rows with feedId NOT NULL (see
-- hiddenFromGrid — set to true at insert time by persistIngest when
-- source.kind === "feed"). On feed delete, items survive as plain
-- curated library rows (SET NULL).
-- ---------------------------------------------------------------------------

ALTER TABLE "Media"
    ADD COLUMN "feedId" TEXT;

ALTER TABLE "Media"
    ADD CONSTRAINT "Media_feedId_fkey"
    FOREIGN KEY ("feedId") REFERENCES "Feed"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Media_feedId_idx" ON "Media"("feedId");

-- Idempotency insurance for the MEDIA-kind feed poller. Nullable
-- sourceUrl + Postgres null-treating-as-distinct in compound uniques
-- means this constraint only binds when BOTH are non-null (i.e. only
-- on feed-sourced rows). Direct uploads with sourceUrl NULL are
-- unaffected.
CREATE UNIQUE INDEX "Media_feedId_sourceUrl_key"
    ON "Media"("feedId", "sourceUrl");

-- ---------------------------------------------------------------------------
-- Additive: User.betaFeatures (text[])
--
-- Feature-flag opt-ins. GIN index supports the fast `betaFeatures @>
-- ARRAY['news']` membership check that hasBetaFeature compiles to
-- under the hood. Default empty array — existing users start with
-- zero beta features, same as a fresh signup.
-- ---------------------------------------------------------------------------

ALTER TABLE "User"
    ADD COLUMN "betaFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "User_betaFeatures_gin"
    ON "User" USING GIN ("betaFeatures");

COMMIT;
