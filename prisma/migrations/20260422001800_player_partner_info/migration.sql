-- PlayerPartnerInfo: one row per NFL player caching the AI+web-search
-- lookup of their publicly-known romantic partner. Populated lazily on
-- first profile view. The not_found row is retained in the cache so
-- repeat views of obscure players don't re-query the web.

BEGIN;

CREATE TABLE "PlayerPartnerInfo" (
    "id"            TEXT NOT NULL,
    "playerId"      TEXT NOT NULL,
    "name"          TEXT,
    "relationship"  TEXT NOT NULL,
    "notableFact"   TEXT,
    "imageUrl"      TEXT,
    "sourceUrl"     TEXT,
    "confidence"    TEXT NOT NULL DEFAULT 'low',
    "checkedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlayerPartnerInfo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlayerPartnerInfo_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlayerPartnerInfo_playerId_key"
  ON "PlayerPartnerInfo"("playerId");

COMMIT;
