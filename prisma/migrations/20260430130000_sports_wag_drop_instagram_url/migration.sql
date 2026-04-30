-- WAG rename cleanup (deploy-2 of 2):
--   Drop `SportsWag.instagramUrl`. Companion to migration
--   20260430120000 which split the rename — that one ADDed
--   `instagramHandle` and backfilled from `instagramUrl` while
--   leaving the legacy column in place so the previously-deployed
--   code kept working through the deploy window.
--
-- Verified before scheduling this migration:
--   - PR #122 deploy 14f24811 SUCCESS — the new code reads/writes
--     `instagramHandle` exclusively.
--   - `git grep instagramUrl` against current main shows zero
--     non-migration code references.
--   - Backfill ran (athletes_created=1, wags_linked=1) with no
--     ambiguous regex misses — the only WAG row had a clean handle.
--
-- Rollback: re-add the column. Backfill from `instagramHandle`
-- using the inverse transformation (`'https://instagram.com/' || handle`)
-- if any production rows need a URL re-projection.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

ALTER TABLE "SportsWag"
  DROP COLUMN "instagramUrl";
