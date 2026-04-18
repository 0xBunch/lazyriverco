-- Per-user LLM usage tracking (Task 1 of 4).
--
-- Two new tables:
--
--   LLMUsageEvent — append-only ledger of every provider call the app
--     makes (chat, tool-loop iteration, vision, Haiku lore selection).
--     Writes are fire-and-forget from the providers layer so a DB
--     outage can't take down chat. Columns cover the full cost-
--     accounting surface (tokens split by role, cache tokens, image
--     count, computed USD) plus the stitching fields (replyId +
--     iteration) that let analytics collapse a multi-step tool loop
--     back into a single "reply".
--
--   ModelPricing — source-of-truth rates per provider+model, USD per
--     1M tokens. Seeded below with Sonnet 4.6 / Haiku 4.5 / Gemini 2.5
--     Flash at rates verified 2026-04-18 against the live pricing pages.
--
-- Both FKs (LLMUsageEvent.userId, LLMUsageEvent.pricingId) use
-- ON DELETE SET NULL — deleting a user or retiring a pricing row MUST
-- NOT cascade-delete the event ledger. Historical cost analysis has to
-- survive both events.

-- gen_random_uuid() lives in pgcrypto on Postgres < 13. Railway ships
-- 15/16 where it's in core, but this IF NOT EXISTS guard makes the
-- seed block safe against any older DB template we (or a future env)
-- might provision from. No-op on current Railway.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "LLMUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "replyId" TEXT,
    "iteration" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricingId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "characterId" TEXT,
    "mediaId" TEXT,
    "requestMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPricing" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputPerMTokUsd" DOUBLE PRECISION NOT NULL,
    "outputPerMTokUsd" DOUBLE PRECISION NOT NULL,
    "cacheReadPerMTokUsd" DOUBLE PRECISION,
    "cacheWritePerMTokUsd" DOUBLE PRECISION,
    "perImageUsd" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LLMUsageEvent_userId_createdAt_idx" ON "LLMUsageEvent"("userId", "createdAt" DESC);
CREATE INDEX "LLMUsageEvent_model_createdAt_idx" ON "LLMUsageEvent"("model", "createdAt" DESC);
CREATE INDEX "LLMUsageEvent_operation_createdAt_idx" ON "LLMUsageEvent"("operation", "createdAt" DESC);
CREATE INDEX "LLMUsageEvent_conversationId_createdAt_idx" ON "LLMUsageEvent"("conversationId", "createdAt" DESC);
CREATE INDEX "LLMUsageEvent_replyId_idx" ON "LLMUsageEvent"("replyId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPricing_model_key" ON "ModelPricing"("model");

-- AddForeignKey
ALTER TABLE "LLMUsageEvent"
    ADD CONSTRAINT "LLMUsageEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LLMUsageEvent"
    ADD CONSTRAINT "LLMUsageEvent_pricingId_fkey"
    FOREIGN KEY ("pricingId") REFERENCES "ModelPricing"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed ModelPricing with three verified rates (claude.com/pricing +
-- ai.google.dev/gemini-api/docs/pricing, verified 2026-04-18).
--   Sonnet 4.6:  $3.00 / $15.00 per MTok, 5-minute cache: $0.30 / $3.75
--   Haiku 4.5:   $1.00 / $5.00  per MTok, 5-minute cache: $0.10 / $1.25
--   Gemini 2.5 Flash: $0.30 / $2.50 per MTok — images count as input
--     tokens so perImageUsd stays NULL (imageCount remains a product
--     metric, not a cost multiplier, for Gemini rows).
INSERT INTO "ModelPricing" ("id", "provider", "model", "inputPerMTokUsd", "outputPerMTokUsd", "cacheReadPerMTokUsd", "cacheWritePerMTokUsd", "perImageUsd", "notes", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'anthropic', 'claude-sonnet-4-6', 3.00, 15.00, 0.30, 3.75, NULL, 'claude.com/pricing, verified 2026-04-18 (5m cache rate)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'anthropic', 'claude-haiku-4-5',  1.00,  5.00, 0.10, 1.25, NULL, 'claude.com/pricing, verified 2026-04-18 (5m cache rate)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'google',    'gemini-2.5-flash',  0.30,  2.50, NULL, NULL, NULL, 'ai.google.dev/gemini-api/docs/pricing, verified 2026-04-18 (images counted in input tokens)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
