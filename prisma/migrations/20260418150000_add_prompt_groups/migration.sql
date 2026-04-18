-- Prompt chip dropdowns — admin-curated groups shown beneath the
-- homepage prompt box. Replaces the hardcoded SUGGESTION_CHIPS array
-- that lived in src/components/ConversationLanding.tsx. Each
-- PromptGroup is a dropdown trigger (e.g. "Write", "Roast", "Learn");
-- each PromptSuggestion inside has a short CTA label shown in the menu
-- and a longer `prompt` string pasted into the input on click.
--
-- Seed (at the bottom of this file) ports the 4 legacy hardcoded
-- strings into a default "Clubhouse" group so the homepage is not
-- visually empty the moment this migration lands. Idempotent via
-- NOT EXISTS — safe to re-run.

CREATE TABLE "PromptGroup" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptGroup_isActive_sortOrder_idx"
    ON "PromptGroup"("isActive", "sortOrder");

CREATE TABLE "PromptSuggestion" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptSuggestion_groupId_sortOrder_idx"
    ON "PromptSuggestion"("groupId", "sortOrder");
CREATE INDEX "PromptSuggestion_groupId_isActive_sortOrder_idx"
    ON "PromptSuggestion"("groupId", "isActive", "sortOrder");

ALTER TABLE "PromptSuggestion"
    ADD CONSTRAINT "PromptSuggestion_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "PromptGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed a default "Clubhouse" group from the 4 legacy hardcoded chips.
-- NOT EXISTS guards make the seed idempotent against a repeat run.
INSERT INTO "PromptGroup" ("id", "label", "sortOrder", "isActive", "updatedAt")
SELECT gen_random_uuid()::text, 'Clubhouse', 0, true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "PromptGroup" WHERE "label" = 'Clubhouse');

INSERT INTO "PromptSuggestion" ("id", "groupId", "label", "prompt", "sortOrder", "isActive", "updatedAt")
SELECT gen_random_uuid()::text, g.id, v.label, v.prompt, v.sort_order, true, NOW()
FROM "PromptGroup" g
CROSS JOIN (
    VALUES
        ('SportsCenter intro', 'Write a SportsCenter intro for Mike''s fantasy team', 0),
        ('Roast Joey', 'Roast Joey''s last draft pick', 1),
        ('Fake ESPN headline', 'Make a fake ESPN headline about trip weekend', 2),
        ('Power ranking', 'Give me a power ranking of the crew', 3)
) AS v(label, prompt, sort_order)
WHERE g."label" = 'Clubhouse'
  AND NOT EXISTS (
      SELECT 1 FROM "PromptSuggestion" s
      WHERE s."groupId" = g.id AND s."label" = v.label
  );
