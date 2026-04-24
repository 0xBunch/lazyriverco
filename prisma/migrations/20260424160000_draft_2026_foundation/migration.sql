-- MLF Rookie Draft 2026 — foundation schema.
--
-- Phase 1a of the draft plan: drops in the full Draft* entity tree plus
-- two additive columns on SleeperPlayer that unblock rookie filtering.
-- No user-facing UI yet (that's Phase 1b — admin shell, helpers, skeleton
-- page) and no cron/auto-advance (soft 24h clock, commissioner nudges).
--
-- Full context + PR decomposition:
--   /Users/bunch/.claude/plans/okay-for-this-one-jolly-sonnet.md
--
-- Safety shape:
--   * All changes ADDITIVE. No column drops, no renames, no destructive
--     ALTERs. SleeperPlayer gets two nullable columns; every Draft*
--     table starts empty.
--   * SleeperPlayer.yearsExp / draftYear are nullable — existing ~11k
--     rows land with NULL and get populated on the next runPlayersSync
--     pass (Phase 1b extends that function).
--   * CHECK constraints on DraftRoom.status and DraftPick.status enforce
--     the known-good transition set but only bind on INSERT. Tables are
--     empty at migration time — no risk of pre-existing violators.
--   * FK cascade policy: DraftRoom delete cascades the whole subtree
--     (slots, picks, pool, images, sponsors — a commissioner reset
--     genuinely should wipe everything). User FKs use RESTRICT so a
--     manager account can't be deleted while seated in an active draft,
--     except DraftPick.lockedById which SETs NULL (pure audit field).
--   * DraftAnnouncerImage.consumedPickId is a nullable unique — nulls
--     are allowed-many by Postgres, so the "one image ever per pick"
--     rule only binds on non-null values. Reset rotation nulls them
--     back out for re-use.

BEGIN;

-- ---------------------------------------------------------------------------
-- Additive: SleeperPlayer.yearsExp, draftYear
--
-- Sleeper's raw /players/nfl payload exposes `years_exp` (int; 0 for
-- rookies incl. UDFAs signed to a roster) and `draft_year` (int, not
-- always present). runPlayersSync will parse both in Phase 1b. The
-- rookie-pool query is:
--   WHERE yearsExp = 0 AND team IS NOT NULL
--     AND position IN ('QB','RB','WR','TE')
-- — so the composite (yearsExp, position, team) index covers it prefix-wise.
-- ---------------------------------------------------------------------------

ALTER TABLE "SleeperPlayer"
    ADD COLUMN "yearsExp"  INTEGER,
    ADD COLUMN "draftYear" INTEGER;

CREATE INDEX "SleeperPlayer_yearsExp_position_team_idx"
    ON "SleeperPlayer" ("yearsExp", "position", "team");

-- ---------------------------------------------------------------------------
-- Table: DraftRoom
--
-- One row per draft event. Slug is the URL key (v1 = "mlf-2026"). Status
-- CHECK constraint is a closed set; adding a state later is a one-liner
-- ALTER. pickClockSec default of 86400 is the soft 24h per-pick budget
-- (Q4 — no auto-pick, red at zero, commissioner nudges).
-- ---------------------------------------------------------------------------

CREATE TABLE "DraftRoom" (
    "id"            TEXT         NOT NULL,
    "slug"          TEXT         NOT NULL,
    "name"          TEXT         NOT NULL,
    "season"        TEXT         NOT NULL,
    "totalRounds"   INTEGER      NOT NULL DEFAULT 3,
    "totalSlots"    INTEGER      NOT NULL DEFAULT 8,
    "snake"         BOOLEAN      NOT NULL DEFAULT true,
    "status"        TEXT         NOT NULL DEFAULT 'setup',
    "pickClockSec"  INTEGER      NOT NULL DEFAULT 86400,
    "openedAt"      TIMESTAMP(3),
    "closedAt"      TIMESTAMP(3),
    "createdBy"     TEXT         NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftRoom_slug_key" ON "DraftRoom"("slug");
CREATE INDEX "DraftRoom_status_idx" ON "DraftRoom"("status");

ALTER TABLE "DraftRoom"
    ADD CONSTRAINT "DraftRoom_status_check"
    CHECK ("status" IN ('setup', 'live', 'paused', 'complete'));

ALTER TABLE "DraftRoom"
    ADD CONSTRAINT "DraftRoom_rounds_check"
    CHECK ("totalRounds" BETWEEN 1 AND 20);

ALTER TABLE "DraftRoom"
    ADD CONSTRAINT "DraftRoom_slots_check"
    CHECK ("totalSlots" BETWEEN 2 AND 32);

-- pickClockSec sanity: 60s floor (too short isn't a draft) up to 7 days
-- (the "we're all on vacation, pick when you're back" ceiling).
ALTER TABLE "DraftRoom"
    ADD CONSTRAINT "DraftRoom_clock_check"
    CHECK ("pickClockSec" BETWEEN 60 AND 604800);

-- ---------------------------------------------------------------------------
-- Table: DraftSlot
--
-- One row per manager seat. (draftId, slotOrder) is the snake-math key
-- — computeSnakeOrder(totalSlots, totalRounds) walks it to build the
-- 24-cell board. (draftId, userId) unique prevents the same user from
-- occupying two slots. userId FK uses RESTRICT so deleting a manager
-- whose slot is live requires explicit admin reassignment.
-- ---------------------------------------------------------------------------

CREATE TABLE "DraftSlot" (
    "id"        TEXT         NOT NULL,
    "draftId"   TEXT         NOT NULL,
    "slotOrder" INTEGER      NOT NULL,
    "userId"    TEXT         NOT NULL,
    "teamName"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftSlot_draftId_slotOrder_key"
    ON "DraftSlot"("draftId", "slotOrder");

CREATE UNIQUE INDEX "DraftSlot_draftId_userId_key"
    ON "DraftSlot"("draftId", "userId");

ALTER TABLE "DraftSlot"
    ADD CONSTRAINT "DraftSlot_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftSlot"
    ADD CONSTRAINT "DraftSlot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Table: DraftPick
--
-- The 24-cell snake grid. overallPick is 1..totalRounds*totalSlots,
-- precomputed server-side so the UI never has to infer. Status CHECK is
-- the closed set (pending → onClock → locked); reverts are via undoneAt
-- rather than a state rollback. Two FKs to User:
--   * userId (DraftPickMaker): the slot's seated manager, denormalized
--     for read performance. RESTRICT because deleting the user mid-draft
--     should force a reassign.
--   * lockedById (DraftPickLocker): who actually clicked Lock. Normally
--     equals userId; different when admin picks on behalf. SET NULL on
--     user delete — it's an audit field, losing it is acceptable.
-- playerId FK to SleeperPlayer uses SET NULL so a Sleeper dedupe/merge
-- doesn't cascade-delete draft history.
-- ---------------------------------------------------------------------------

CREATE TABLE "DraftPick" (
    "id"           TEXT         NOT NULL,
    "draftId"      TEXT         NOT NULL,
    "round"        INTEGER      NOT NULL,
    "pickInRound"  INTEGER      NOT NULL,
    "overallPick"  INTEGER      NOT NULL,
    "slotId"       TEXT         NOT NULL,
    "userId"       TEXT         NOT NULL,
    "playerId"     TEXT,
    "status"       TEXT         NOT NULL DEFAULT 'pending',
    "onClockAt"    TIMESTAMP(3),
    "lockedAt"     TIMESTAMP(3),
    "lockedById"   TEXT,
    "undoneAt"     TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftPick_draftId_overallPick_key"
    ON "DraftPick"("draftId", "overallPick");

CREATE INDEX "DraftPick_draftId_status_idx"
    ON "DraftPick"("draftId", "status");

CREATE INDEX "DraftPick_draftId_round_pickInRound_idx"
    ON "DraftPick"("draftId", "round", "pickInRound");

ALTER TABLE "DraftPick"
    ADD CONSTRAINT "DraftPick_status_check"
    CHECK ("status" IN ('pending', 'onClock', 'locked'));

ALTER TABLE "DraftPick"
    ADD CONSTRAINT "DraftPick_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftPick"
    ADD CONSTRAINT "DraftPick_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "DraftSlot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftPick"
    ADD CONSTRAINT "DraftPick_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DraftPick"
    ADD CONSTRAINT "DraftPick_lockedById_fkey"
    FOREIGN KEY ("lockedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DraftPick"
    ADD CONSTRAINT "DraftPick_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Table: DraftPoolPlayer
--
-- Per-draft rookie pool — the universe of players managers can select
-- from. Auto-seeded by seedRookiePool() in Phase 1b from SleeperPlayer
-- rows matching the rookie filter. Admin add/remove operates on this
-- table; `removed=true` is a soft-delete that keeps the audit trail.
-- addedBy is a plain string (user ID snapshot), not an FK, to survive
-- a user deletion without cascading away the historical pool state.
-- ---------------------------------------------------------------------------

CREATE TABLE "DraftPoolPlayer" (
    "id"         TEXT         NOT NULL,
    "draftId"    TEXT         NOT NULL,
    "playerId"   TEXT         NOT NULL,
    "addedBy"    TEXT         NOT NULL,
    "removed"    BOOLEAN      NOT NULL DEFAULT false,
    "note"       TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftPoolPlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftPoolPlayer_draftId_playerId_key"
    ON "DraftPoolPlayer"("draftId", "playerId");

CREATE INDEX "DraftPoolPlayer_draftId_removed_idx"
    ON "DraftPoolPlayer"("draftId", "removed");

ALTER TABLE "DraftPoolPlayer"
    ADD CONSTRAINT "DraftPoolPlayer_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftPoolPlayer"
    ADD CONSTRAINT "DraftPoolPlayer_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Table: RookieScoutingReport
--
-- One row per SleeperPlayer — the scouting blurb is player-scoped, not
-- draft-scoped, so the same rookie's dossier shared across drafts. Admin
-- regenerates via delete + re-fetch (generateRookieScoutingReport in
-- src/lib/sleeper-ai.ts is single-flight, lazy-on-view). Model ID stored
-- so we can audit after a version bump.
-- ---------------------------------------------------------------------------

CREATE TABLE "RookieScoutingReport" (
    "id"         TEXT         NOT NULL,
    "playerId"   TEXT         NOT NULL,
    "body"       TEXT         NOT NULL,
    "voice"      TEXT         NOT NULL DEFAULT 'analyst',
    "model"      TEXT         NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RookieScoutingReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RookieScoutingReport_playerId_key"
    ON "RookieScoutingReport"("playerId");

ALTER TABLE "RookieScoutingReport"
    ADD CONSTRAINT "RookieScoutingReport_voice_check"
    CHECK ("voice" IN ('analyst', 'scout', 'goodell'));

ALTER TABLE "RookieScoutingReport"
    ADD CONSTRAINT "RookieScoutingReport_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Table: DraftPickReaction
--
-- Per-pick AI reaction fired server-side on lockPick. characterId is
-- nullable (v1 uses a neutral "MLF draft announcer" voice; character
-- personas deferred to v1.1 to avoid coupling with PlayerAgentTake's
-- (playerId, characterId) caching key). Admin regenerates via delete.
-- ---------------------------------------------------------------------------

CREATE TABLE "DraftPickReaction" (
    "id"           TEXT         NOT NULL,
    "draftPickId"  TEXT         NOT NULL,
    "body"         TEXT         NOT NULL,
    "characterId"  TEXT,
    "model"        TEXT         NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftPickReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftPickReaction_draftPickId_key"
    ON "DraftPickReaction"("draftPickId");

ALTER TABLE "DraftPickReaction"
    ADD CONSTRAINT "DraftPickReaction_draftPickId_fkey"
    FOREIGN KEY ("draftPickId") REFERENCES "DraftPick"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftPickReaction"
    ADD CONSTRAINT "DraftPickReaction_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Table: DraftAnnouncerImage
--
-- Goodell-box image pool (Q12, revised). Commissioner uploads ~30+
-- images pre-draft; server picks one per pick-lock at random without
-- replacement. consumedPickId (nullable unique) flips non-null when an
-- image fires for a pick and binds there — the unique index enforces
-- "at most one image per pick, one pick per image." Admin reset
-- rotation nulls them back out.
--
-- R2 key prefix: "draft/{draftId}/{uuid}.{ext}" keeps the pool
-- auditable and scoped to the draft.
-- ---------------------------------------------------------------------------

CREATE TABLE "DraftAnnouncerImage" (
    "id"              TEXT         NOT NULL,
    "draftId"         TEXT         NOT NULL,
    "r2Key"           TEXT         NOT NULL,
    "label"           TEXT,
    "uploadedBy"      TEXT         NOT NULL,
    "consumedPickId"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftAnnouncerImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftAnnouncerImage_consumedPickId_key"
    ON "DraftAnnouncerImage"("consumedPickId");

CREATE INDEX "DraftAnnouncerImage_draftId_consumedPickId_idx"
    ON "DraftAnnouncerImage"("draftId", "consumedPickId");

ALTER TABLE "DraftAnnouncerImage"
    ADD CONSTRAINT "DraftAnnouncerImage_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftAnnouncerImage"
    ADD CONSTRAINT "DraftAnnouncerImage_consumedPickId_fkey"
    FOREIGN KEY ("consumedPickId") REFERENCES "DraftPick"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Table: DraftSponsor
--
-- Per-draft sponsor rotation widget (Q15). Doesn't persist across drafts
-- — each draft manages its own sponsor list inline in /admin/draft/[id]/
-- setup. displayOrder drives rotation sequence; active=false hides an
-- entry without deleting. imageR2Key + linkUrl reserved for v2 UI.
-- ---------------------------------------------------------------------------

CREATE TABLE "DraftSponsor" (
    "id"            TEXT         NOT NULL,
    "draftId"       TEXT         NOT NULL,
    "name"          TEXT         NOT NULL,
    "tagline"       TEXT,
    "imageR2Key"    TEXT,
    "linkUrl"       TEXT,
    "displayOrder"  INTEGER      NOT NULL DEFAULT 0,
    "active"        BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftSponsor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DraftSponsor_draftId_active_displayOrder_idx"
    ON "DraftSponsor"("draftId", "active", "displayOrder");

ALTER TABLE "DraftSponsor"
    ADD CONSTRAINT "DraftSponsor_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
