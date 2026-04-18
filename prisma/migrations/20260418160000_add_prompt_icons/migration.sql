-- Prompt chip icons — v1.1 of the homepage prompt groups feature.
-- Adds a nullable `icon` column to both PromptGroup and PromptSuggestion
-- that stores a Lucide icon name from the curated allowlist in
-- src/lib/prompt-icons.ts. Null = render label only. Unknown names
-- silently downgrade to null at render time so trimming the allowlist
-- doesn't strand rows.
--
-- Additive + nullable — no backfill, no seed required.

ALTER TABLE "PromptGroup" ADD COLUMN "icon" TEXT;
ALTER TABLE "PromptSuggestion" ADD COLUMN "icon" TEXT;
