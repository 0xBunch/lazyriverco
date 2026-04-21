-- Sleeper integration: retire the AI-agent meta-draft tables (PlayerPool,
-- Roster, LineupDecision) and add a single SleeperPlayer reference table to
-- hydrate Sleeper playerId -> display name on rosters and transactions.
--
-- FK audit (pre-migration):
--   Roster.characterId -> Character (onDelete CASCADE); no incoming FKs.
--   LineupDecision.rosterId -> Roster (onDelete CASCADE); no incoming FKs.
--   PlayerPool: standalone, no incoming FKs.
-- Pick/PickResult remain untouched — they're a separate (currently unused)
-- predictions feature with no code paths in src/ referencing them.

BEGIN;

DROP TABLE IF EXISTS "LineupDecision" CASCADE;
DROP TABLE IF EXISTS "Roster"         CASCADE;
DROP TABLE IF EXISTS "PlayerPool"     CASCADE;

CREATE TABLE "SleeperPlayer" (
    "playerId"         TEXT NOT NULL,
    "firstName"        TEXT,
    "lastName"         TEXT,
    "fullName"         TEXT,
    "position"         TEXT,
    "team"             TEXT,
    "fantasyPositions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"           TEXT,
    "injuryStatus"     TEXT,
    "active"           BOOLEAN NOT NULL DEFAULT true,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SleeperPlayer_pkey" PRIMARY KEY ("playerId")
);

CREATE INDEX "SleeperPlayer_team_idx"     ON "SleeperPlayer"("team");
CREATE INDEX "SleeperPlayer_position_idx" ON "SleeperPlayer"("position");

COMMIT;
