-- Optional free-form time-of-day on CalendarEntry.
--
-- String, not TIME — admins write what they mean ("7:00 PM", "Noon",
-- "After dinner"). No timezone math; the date column already carries
-- calendar-day semantics and times here are display-only.
--
-- Rendered only in the new /calendar list view. The month grid ignores
-- it, so existing rendering is unaffected.
--
-- Additive + nullable — no backfill, no lock beyond the brief DDL.

ALTER TABLE "CalendarEntry" ADD COLUMN "time" TEXT;
