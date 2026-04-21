-- Seed ModelPricing for the two Replicate text-to-image models the chat
-- stream route dispatches to (src/lib/imageGen.ts):
--
--   black-forest-labs/flux-dev   — SFW default
--   lucataco/realvisxl-v2.0      — NSFW default (community SDXL fine-tune)
--
-- Rates verified 2026-04-21 against replicate.com:
--   flux-dev:        $0.025 / output image   (replicate.com/pricing)
--   realvisxl-v2.0:  $0.0051 per run         (replicate.com/lucataco/realvisxl-v2.0)
--
-- Token rates are zero — Replicate bills per image (flux-dev) or per
-- run (realvisxl-v2.0), not per token. The recordUsage() formula in
-- src/lib/usage.ts reduces to `imageCount * perImageUsd` when the
-- token-per-MTok rates are all zero, which is exactly what we want.
--
-- ON CONFLICT ("model") DO NOTHING so this migration is idempotent and
-- never clobbers a rate KB has already edited via the ModelPricingPanel
-- UI on /admin/usage.

INSERT INTO "ModelPricing" ("id", "provider", "model", "inputPerMTokUsd", "outputPerMTokUsd", "cacheReadPerMTokUsd", "cacheWritePerMTokUsd", "perImageUsd", "notes", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'replicate', 'black-forest-labs/flux-dev', 0, 0, NULL, NULL, 0.025,  'replicate.com/pricing, verified 2026-04-21 ($0.025 / output image)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'replicate', 'lucataco/realvisxl-v2.0',    0, 0, NULL, NULL, 0.0051, 'replicate.com/lucataco/realvisxl-v2.0, verified 2026-04-21 (~$0.0051 / run, varies by inputs)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("model") DO NOTHING;
