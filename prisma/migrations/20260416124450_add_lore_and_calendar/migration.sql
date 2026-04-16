-- Migration: Knowledge Bank — Lore + CalendarEntry tables.
--
-- Lore entries are topic-tagged text chunks selected by a two-pass
-- Haiku call based on conversation relevance. CalendarEntry rows are
-- date-based knowledge (birthdays, cultural moments) auto-injected
-- when the date is within ±7 days of today.
--
-- No existing tables are modified. Additive only.

BEGIN;

-- -------------------------------------------------------------------
-- 1. Lore table
-- -------------------------------------------------------------------
CREATE TABLE "Lore" (
    "id"        TEXT NOT NULL,
    "topic"     TEXT NOT NULL,
    "tags"      TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content"   TEXT NOT NULL,
    "isCore"    BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lore_pkey" PRIMARY KEY ("id")
);

-- Read path: fetch all isCore entries + sort for display/injection.
CREATE INDEX "Lore_isCore_sortOrder_idx" ON "Lore"("isCore", "sortOrder");

-- -------------------------------------------------------------------
-- 2. CalendarEntry table
-- -------------------------------------------------------------------
CREATE TABLE "CalendarEntry" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "date"        DATE NOT NULL,
    "recurrence"  TEXT NOT NULL DEFAULT 'none',
    "tags"        TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- Read path: date-proximity queries for upcoming entries.
CREATE INDEX "CalendarEntry_date_idx" ON "CalendarEntry"("date");

COMMIT;
