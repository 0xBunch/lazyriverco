-- Migration: add Channel + AgentChannel + AgentRelationship + ClubhouseCanon
-- tables, plus User.blurb/city/favoriteTeam, plus Message.channelId.
--
-- The Message.channelId column is added in three steps to avoid the empty-
-- table check failing against the 19 existing rows: nullable add → backfill
-- to the seeded `mensleague` channel → enforce NOT NULL.
--
-- Wrapped in BEGIN/COMMIT so partial failure rolls back the whole thing
-- (per data-integrity-guardian B1). LOCK TABLE on Message + Character
-- closes the race window where a concurrent insert during deploy could
-- end up with a NULL channelId before the SET NOT NULL fires (B2).
--
-- The default channel is seeded with a hardcoded UUID
-- (449457c4-7a9a-40f6-9634-b146be5580f3) so the migration doesn't depend on
-- the pgcrypto / uuid-ossp extension being installed on Railway's Postgres.

BEGIN;

-- Lock both tables we backfill against. Blocks any concurrent inserts to
-- Message and Character for the duration of the migration so the backfill
-- is point-in-time consistent. Released on COMMIT.
LOCK TABLE "Message"   IN EXCLUSIVE MODE;
LOCK TABLE "Character" IN EXCLUSIVE MODE;

-- AlterTable: User curated context fields (all nullable)
ALTER TABLE "User"
  ADD COLUMN "blurb"        TEXT,
  ADD COLUMN "city"         TEXT,
  ADD COLUMN "favoriteTeam" TEXT;

-- CreateTable: Channel
CREATE TABLE "Channel" (
    "id"          TEXT NOT NULL,
    "slug"        TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Channel_slug_key" ON "Channel"("slug");
-- Partial unique: at most one row may have isDefault=true.
CREATE UNIQUE INDEX "Channel_isDefault_key"
  ON "Channel"("isDefault")
  WHERE "isDefault" = true;

-- Seed: the one-and-only default channel for v1.
INSERT INTO "Channel" ("id", "slug", "displayName", "description", "isDefault", "createdAt")
VALUES (
  '449457c4-7a9a-40f6-9634-b146be5580f3',
  'mensleague',
  'Mens League',
  'The main lane of the clubhouse. Not just football.',
  true,
  CURRENT_TIMESTAMP
);

-- AlterTable: Message.channelId, in three steps.
-- Step 1: add as nullable so the existing 19 rows don't violate NOT NULL.
ALTER TABLE "Message" ADD COLUMN "channelId" TEXT;
-- Step 2: backfill every existing message into the default channel.
UPDATE "Message"
SET "channelId" = '449457c4-7a9a-40f6-9634-b146be5580f3'
WHERE "channelId" IS NULL;
-- Step 3: lock it. Now and forever every chat message lives in a channel.
ALTER TABLE "Message" ALTER COLUMN "channelId" SET NOT NULL;

-- CreateTable: AgentChannel join
CREATE TABLE "AgentChannel" (
    "characterId" TEXT NOT NULL,
    "channelId"   TEXT NOT NULL,
    CONSTRAINT "AgentChannel_pkey" PRIMARY KEY ("characterId","channelId")
);

-- Seed: link every existing character to the default channel. New chars
-- are linked via the seed script / admin UI.
INSERT INTO "AgentChannel" ("characterId", "channelId")
SELECT "Character"."id", '449457c4-7a9a-40f6-9634-b146be5580f3'
FROM "Character";

-- CreateTable: AgentRelationship
CREATE TABLE "AgentRelationship" (
    "id"           TEXT NOT NULL,
    "characterId"  TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "content"      TEXT NOT NULL,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRelationship_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentRelationship_characterId_targetUserId_key"
  ON "AgentRelationship"("characterId", "targetUserId");
CREATE INDEX "AgentRelationship_targetUserId_idx"
  ON "AgentRelationship"("targetUserId");

-- CreateTable: ClubhouseCanon (single-row convention)
CREATE TABLE "ClubhouseCanon" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL DEFAULT 'default',
    "content"   TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubhouseCanon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubhouseCanon_name_key" ON "ClubhouseCanon"("name");

-- Seed: empty default canon row so the app's findFirst({where:{name:'default'}})
-- never returns null. The admin UI populates the content field.
INSERT INTO "ClubhouseCanon" ("id", "name", "content", "updatedAt")
VALUES (
  '7a8b3c1d-2e4f-4a6b-8c9d-0e1f2a3b4c5d',
  'default',
  '',
  CURRENT_TIMESTAMP
);

-- AddForeignKey: Message → Channel.
-- ON DELETE RESTRICT (NOT cascade): refuse to delete a channel that still
-- has messages. Cascading would silently nuke chat history if an admin
-- ever misclicks. Channel deletion is a deliberate, archive-first op.
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite index covering the GET-messages-by-channel-by-time read path.
CREATE INDEX "Message_channelId_createdAt_idx"
  ON "Message"("channelId", "createdAt" DESC);

-- AddForeignKey: AgentChannel
ALTER TABLE "AgentChannel"
  ADD CONSTRAINT "AgentChannel_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentChannel"
  ADD CONSTRAINT "AgentChannel_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AgentRelationship
ALTER TABLE "AgentRelationship"
  ADD CONSTRAINT "AgentRelationship_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRelationship"
  ADD CONSTRAINT "AgentRelationship_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
