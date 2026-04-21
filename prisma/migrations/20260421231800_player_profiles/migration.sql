-- Player profile data model: per-season stats, projections, agent takes,
-- and a season narrative blurb. All keyed by Sleeper playerId (String);
-- SleeperPlayer rows are the FK target so a player delete cascades.

BEGIN;

CREATE TABLE "PlayerSeasonStats" (
    "id"          TEXT NOT NULL,
    "playerId"    TEXT NOT NULL,
    "season"      TEXT NOT NULL,
    "ptsPpr"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ptsHalfPpr"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ptsStd"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "rankPpr"     INTEGER,
    "posRankPpr"  INTEGER,
    "weeklyPpr"   JSONB NOT NULL DEFAULT '[]'::jsonb,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlayerSeasonStats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlayerSeasonStats_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId")
      ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlayerSeasonStats_playerId_season_key"
  ON "PlayerSeasonStats"("playerId","season");
CREATE INDEX "PlayerSeasonStats_season_ptsPpr_idx"
  ON "PlayerSeasonStats"("season","ptsPpr" DESC);

CREATE TABLE "PlayerSeasonProjection" (
    "id"          TEXT NOT NULL,
    "playerId"    TEXT NOT NULL,
    "season"      TEXT NOT NULL,
    "ptsPpr"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ptsHalfPpr"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "adpPpr"      DOUBLE PRECISION,
    "adpHalfPpr"  DOUBLE PRECISION,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlayerSeasonProjection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlayerSeasonProjection_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId")
      ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlayerSeasonProjection_playerId_season_key"
  ON "PlayerSeasonProjection"("playerId","season");
CREATE INDEX "PlayerSeasonProjection_season_ptsPpr_idx"
  ON "PlayerSeasonProjection"("season","ptsPpr" DESC);

CREATE TABLE "PlayerAgentTake" (
    "id"          TEXT NOT NULL,
    "playerId"    TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "take"        TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerAgentTake_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlayerAgentTake_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerAgentTake_characterId_fkey"
      FOREIGN KEY ("characterId") REFERENCES "Character"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlayerAgentTake_playerId_characterId_key"
  ON "PlayerAgentTake"("playerId","characterId");
CREATE INDEX "PlayerAgentTake_playerId_idx"
  ON "PlayerAgentTake"("playerId");

CREATE TABLE "LeagueSeasonNarrative" (
    "id"        TEXT NOT NULL,
    "leagueId"  TEXT NOT NULL,
    "season"    TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeagueSeasonNarrative_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeagueSeasonNarrative_leagueId_season_key"
  ON "LeagueSeasonNarrative"("leagueId","season");

COMMIT;
