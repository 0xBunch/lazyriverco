-- Migration: phase 1 of the lazy-river refactor.
--
-- Adds Conversation + RateLimitHit + MediaStatus enum. Relaxes
-- Message.channelId to nullable and introduces Message.conversationId as
-- the second parent, enforced by a raw-SQL CHECK constraint so exactly
-- one of the two is set on every row. Adds Character.isDefault + partial
-- unique index and seeds the single default character (Moises, UUID
-- mirrored in src/lib/characters.ts as DEFAULT_CHARACTER_ID in Task 2).
-- Extends Media with status/caption/mimeType for the R2 upload flow
-- wired in Task 8.
--
-- Wrapped in BEGIN/COMMIT so partial failure rolls back the whole
-- thing. LOCK TABLE on Message + Character + Media closes the window
-- where a concurrent insert during deploy could slip in a row that
-- violates the new CHECK constraint or creates an isDefault conflict.
--
-- Full context + rationale: /Users/bunch/.claude/plans/deep-humming-pumpkin.md Task 1.
-- Pre-code review 2026-04-15 (architecture-strategist,
-- pattern-recognition-specialist, data-integrity-guardian,
-- data-migration-expert, security-sentinel).

BEGIN;

-- Lock the tables we mutate. Released on COMMIT.
LOCK TABLE "Message"   IN EXCLUSIVE MODE;
LOCK TABLE "Character" IN EXCLUSIVE MODE;
LOCK TABLE "Media"     IN EXCLUSIVE MODE;

-- -------------------------------------------------------------------
-- 1. Pre-flight integrity check. The new CHECK constraint below would
--    fail if any existing Message row has a NULL channelId (shouldn't,
--    but defense in depth — fail fast with a clear error instead of
--    silently leaving the migration half-applied).
-- -------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "Message" WHERE "channelId" IS NULL) > 0 THEN
    RAISE EXCEPTION
      'Pre-migration: % Message rows already have NULL channelId. Refusing to relax NOT NULL + add XOR CHECK constraint. Investigate before retrying.',
      (SELECT COUNT(*) FROM "Message" WHERE "channelId" IS NULL);
  END IF;
END $$;

-- -------------------------------------------------------------------
-- 2. Message: relax channelId + add conversationId column (FK added
--    after the Conversation table exists below).
-- -------------------------------------------------------------------
ALTER TABLE "Message" ALTER COLUMN "channelId" DROP NOT NULL;
ALTER TABLE "Message" ADD COLUMN "conversationId" TEXT;

-- -------------------------------------------------------------------
-- 3. Conversation table.
-- -------------------------------------------------------------------
CREATE TABLE "Conversation" (
    "id"            TEXT NOT NULL,
    "ownerId"       TEXT NOT NULL,
    "characterId"   TEXT NOT NULL,
    "title"         VARCHAR(200),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt"    TIMESTAMP(3),
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- Owner cascade: removing a User reaps their private conversations.
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Character restrict: refuse to delete a Character that has live
-- threads. Matches the existing Message_channelId_fkey RESTRICT pattern.
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sidebar read path: "most recent conversations for this user".
CREATE INDEX "Conversation_ownerId_lastMessageAt_idx"
  ON "Conversation"("ownerId", "lastMessageAt" DESC);

-- -------------------------------------------------------------------
-- 4. Message.conversationId FK + index + CHECK XOR.
-- -------------------------------------------------------------------
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Message_conversationId_createdAt_idx"
  ON "Message"("conversationId", "createdAt" DESC);

-- The load-bearing invariant: exactly one of channelId/conversationId
-- is set on every row. Prisma can't model CHECK in schema.prisma but
-- leaves raw-SQL CHECKs alone during introspection, so this survives
-- future `migrate dev` runs. Every write site must honor it.
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_exactly_one_parent_chk"
  CHECK (
    ("channelId" IS NOT NULL AND "conversationId" IS NULL)
    OR ("channelId" IS NULL AND "conversationId" IS NOT NULL)
  );

-- -------------------------------------------------------------------
-- 5. Character.isDefault + partial unique index + seed Moises.
-- -------------------------------------------------------------------
ALTER TABLE "Character"
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- At most one row may have isDefault=true. Mirrors the existing
-- Channel_isDefault_key pattern from the prior migration — Prisma can't
-- model partial predicates in @@unique, but raw-SQL partial unique
-- indexes round-trip cleanly across subsequent migrate runs.
CREATE UNIQUE INDEX "Character_isDefault_key"
  ON "Character"("isDefault")
  WHERE "isDefault" = true;

-- Seed: the default "Moises" character for the new personal-chat
-- surface. Hardcoded UUID so the migration doesn't depend on a pgcrypto
-- extension being installed, and so src/lib/characters.ts (Task 2) can
-- mirror the literal value as DEFAULT_CHARACTER_ID. ON CONFLICT DO
-- NOTHING makes it idempotent if the seed script ran against the same
-- DB first.
INSERT INTO "Character" (
  "id",
  "name",
  "displayName",
  "systemPrompt",
  "triggerKeywords",
  "responseProbability",
  "activeModules",
  "active",
  "isDefault",
  "createdAt"
)
VALUES (
  'f1e2d3c4-b5a6-4978-9012-3456789abcde',
  'moises',
  'Moises',
  'You are Moises, the in-house AI companion for The Lazy River Co. — a private hangout for a tight men''s league crew (MLF). You know the crew, you know the league, you help your people make funny shit to drop into their iMessage group chat. Chill river-guide vibe. Irreverent, sharp, locker-room warm. No corporate polish, no disclaimers, no ''As an AI'' anything. When someone asks about fantasy strategy, lineups, trades, or specific players, wrap up with <suggest-agent name="joey-barfdog" reason="Joey lives for this stuff"> so they can spin off a new chat with Joey.',
  ARRAY[]::TEXT[],
  0.0,
  ARRAY[]::TEXT[],
  true,
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

-- -------------------------------------------------------------------
-- 6. Media: MediaStatus enum + columns + composite index.
-- -------------------------------------------------------------------
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY', 'DELETED');

ALTER TABLE "Media"
  ADD COLUMN "status"   "MediaStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "caption"  TEXT,
  ADD COLUMN "mimeType" TEXT;

-- Read path for buildRichContext: WHERE status='READY' ORDER BY
-- hallOfFame DESC, createdAt DESC. Composite matches so Postgres can
-- serve it as an index scan once the Media table grows.
CREATE INDEX "Media_status_hallOfFame_createdAt_idx"
  ON "Media"("status", "hallOfFame", "createdAt" DESC);

-- -------------------------------------------------------------------
-- 7. RateLimitHit table. Wired by src/lib/rate-limit.ts in Task 3
--    (the helper already exists as a feature-flagged stub from Task 0e).
-- -------------------------------------------------------------------
CREATE TABLE "RateLimitHit" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "bucket"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RateLimitHit"
  ADD CONSTRAINT "RateLimitHit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Sliding-window read path: "count recent hits for this user/bucket".
CREATE INDEX "RateLimitHit_userId_bucket_createdAt_idx"
  ON "RateLimitHit"("userId", "bucket", "createdAt");

COMMIT;
