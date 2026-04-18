-- Per-agent admin-curated display order for the agent pickers.
--
-- The homepage card, chats filter chips, relationships matrix, and the
-- /admin/agents list have all been ordering by displayName. Adds a
-- single integer column the admin can shuffle from /admin/agents and
-- backfills it from the existing alphabetical order so first paint
-- post-migration is byte-identical.
--
-- Step gap of 10 between rows leaves room for future "drop here"
-- inserts without renumbering every row, but the admin UI ships with
-- swap-with-neighbor up/down buttons that just exchange two values, so
-- the gap is purely defensive. Index supports the new
-- ORDER BY (displayOrder ASC, displayName ASC) read pattern.

ALTER TABLE "Character" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "displayName" ASC, "name" ASC) * 10 AS pos
  FROM "Character"
)
UPDATE "Character" c
SET "displayOrder" = ordered.pos
FROM ordered
WHERE c.id = ordered.id;

CREATE INDEX "Character_displayOrder_idx" ON "Character"("displayOrder");
