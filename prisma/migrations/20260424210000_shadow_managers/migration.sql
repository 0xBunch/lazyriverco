-- Shadow-manager support: DraftSlot.isShadow + DraftShadowPick table.
--
-- Enables the "Joey / OORFV" pattern — an 8th team the commissioner
-- shadow-manages on behalf of an absent friend who isn't a
-- lazyriverco user. The shadow's User row is a plain row with
-- passwordHash=NULL (login simply fails for shadow users, which is
-- correct — they never log in). This migration adds:
--
--   * DraftSlot.isShadow — explicit marker so the "this slot isn't
--     staffed" semantic stays separate from the incidental
--     passwordHash=NULL case (future OAuth-only real users, etc.).
--
--   * DraftShadowPick — per-round, per-slot pre-seed. The commissioner
--     fills up to totalRounds rows for each shadow slot during setup;
--     openDraft reads these when materializing DraftPick rows and
--     stamps the matching picks as status=locked immediately.
--
-- Full plan + phase context:
--   /Users/bunch/.claude/plans/okay-for-this-one-jolly-sonnet.md (Phase 5)
--
-- Safety shape:
--   * Purely additive. No column drops, renames, destructive ALTERs.
--   * DraftSlot.isShadow default=false; every existing slot picks up
--     false automatically. No backfill needed.
--   * DraftShadowPick starts empty; CHECK-style invariants (one row per
--     (draftId, slotId, round)) bind only on INSERT.
--   * Cascade policy: DraftRoom delete cascades the full shadow-pick
--     subtree. DraftSlot delete also cascades (via its own draft-cascade
--     and the direct slotId FK). SleeperPlayer delete cascades so a
--     purged player can't leave an orphan pre-seed that points nowhere.

BEGIN;

-- ---------------------------------------------------------------------------
-- Additive: DraftSlot.isShadow
-- ---------------------------------------------------------------------------

ALTER TABLE "DraftSlot"
    ADD COLUMN "isShadow" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Table: DraftShadowPick
--
-- One row per (draftId, slotId, round). Unique constraint enforces the
-- one-pick-per-round-per-slot invariant. Index on (draftId, slotId)
-- supports the openDraft fetch ("all shadow picks for this draft, grouped
-- by slot, keyed by round") without scanning.
-- ---------------------------------------------------------------------------

CREATE TABLE "DraftShadowPick" (
    "id"        TEXT         NOT NULL,
    "draftId"   TEXT         NOT NULL,
    "slotId"    TEXT         NOT NULL,
    "round"     INTEGER      NOT NULL,
    "playerId"  TEXT         NOT NULL,
    "addedBy"   TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftShadowPick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftShadowPick_draftId_slotId_round_key"
    ON "DraftShadowPick"("draftId", "slotId", "round");

CREATE INDEX "DraftShadowPick_draftId_slotId_idx"
    ON "DraftShadowPick"("draftId", "slotId");

-- Round sanity: positive and reasonably capped. Matches the DraftRoom
-- totalRounds CHECK (1..20) set in the foundation migration.
ALTER TABLE "DraftShadowPick"
    ADD CONSTRAINT "DraftShadowPick_round_check"
    CHECK ("round" BETWEEN 1 AND 20);

ALTER TABLE "DraftShadowPick"
    ADD CONSTRAINT "DraftShadowPick_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftShadowPick"
    ADD CONSTRAINT "DraftShadowPick_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "DraftSlot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftShadowPick"
    ADD CONSTRAINT "DraftShadowPick_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId")
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
