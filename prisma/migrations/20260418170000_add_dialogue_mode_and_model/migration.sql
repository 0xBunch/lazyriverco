-- Per-agent dialogue mode + model selection.
--
-- Two new nullable-style additive columns on Character:
--   dialogueMode — unlocks longer proportional replies and optional
--     <followups>…</followups> suggestion chips. Off by default; flipped
--     per persona via /admin/agents.
--   model — Anthropic model ID override. Default mirrors CHAT_MODEL
--     (src/lib/anthropic.ts) so existing agents are behavior-identical
--     post-migration. Admin can pick Haiku 4.5 for cheap personas or
--     Opus 4.7 for the ones that should feel smart.
--
-- Additive + defaulted — no backfill needed.

ALTER TABLE "Character" ADD COLUMN "dialogueMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Character" ADD COLUMN "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';
