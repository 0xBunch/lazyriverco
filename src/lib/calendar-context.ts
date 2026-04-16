import "server-only";
import { prisma } from "@/lib/prisma";

// Date-proximity context for agent system prompts. Fetches CalendarEntry
// rows whose date falls within ±windowDays of today, accounting for
// annual recurrence (birthdays). Auto-injected — no Haiku selection
// needed, purely temporal relevance.

const DEFAULT_WINDOW_DAYS = 7;

export type CalendarContextRow = {
  title: string;
  date: Date;
  description: string | null;
  recurrence: string;
};

/**
 * Fetch calendar entries within ±windowDays of today.
 *
 * For `recurrence: "annual"`, the stored date's year is ignored — only
 * month + day are compared against today. For `recurrence: "none"`, the
 * full date (including year) is compared.
 *
 * The corpus is small (max ~50 entries — birthdays + holidays) so we
 * fetch all and filter in JS rather than trying to express the annual
 * normalization in SQL.
 */
export async function getUpcomingCalendarEntries(
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<CalendarContextRow[]> {
  const now = new Date();
  const todayMs = now.getTime();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  const allEntries = await prisma.calendarEntry.findMany({
    select: {
      title: true,
      date: true,
      description: true,
      recurrence: true,
    },
  });

  const results: CalendarContextRow[] = [];

  for (const entry of allEntries) {
    if (entry.recurrence === "annual") {
      // Normalize the entry's month+day to the current year (and next
      // year, to handle Dec→Jan boundary).
      const entryDate = new Date(entry.date);
      for (const yearOffset of [0, 1, -1]) {
        const normalized = new Date(
          now.getFullYear() + yearOffset,
          entryDate.getMonth(),
          entryDate.getDate(),
        );
        const diff = Math.abs(normalized.getTime() - todayMs);
        if (diff <= windowMs) {
          results.push({
            title: entry.title,
            date: normalized,
            description: entry.description,
            recurrence: entry.recurrence,
          });
          break; // Only include once
        }
      }
    } else {
      // One-time event: compare the actual date
      const entryDate = new Date(entry.date);
      const diff = Math.abs(entryDate.getTime() - todayMs);
      if (diff <= windowMs) {
        results.push({
          title: entry.title,
          date: entryDate,
          description: entry.description,
          recurrence: entry.recurrence,
        });
      }
    }
  }

  // Sort by date proximity (closest first)
  results.sort(
    (a, b) =>
      Math.abs(a.date.getTime() - todayMs) -
      Math.abs(b.date.getTime() - todayMs),
  );

  return results;
}
