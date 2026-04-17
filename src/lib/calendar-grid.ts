import type { CalendarEntry } from "@prisma/client";

// Pure date-math utilities for the user-facing /calendar month grid.
// No Prisma, no React — exported so they're trivially unit-testable.
// Mirror of the recurrence rules used by calendar-context.ts (for agent
// prompts): `recurrence: "annual"` means year is ignored and only
// month+day are matched; "none" means the full stored date.
//
// Date representation note: CalendarEntry.date is `@db.Date` in Prisma,
// which serializes to a JS Date at UTC midnight of the calendar day. We
// do all grid math in UTC to stay consistent with that storage model.
// The only wrinkle is deciding what "today" means for the highlight —
// that uses the server's local date (see toLocalIsoDate) so the "today"
// ring tracks the wall clock the admin actually sees, not UTC.

export type GridCell = {
  /** Calendar date as ISO "YYYY-MM-DD". Not a timestamp. */
  isoDate: string;
  /** 1-31. */
  day: number;
  /** True if the cell belongs to the month being viewed (vs. spillover). */
  inMonth: boolean;
  /** True if the cell is today's date. */
  isToday: boolean;
};

export type ExpandedEntry = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  recurrence: string;
  /** ISO date the entry lands on in the visible grid range. */
  isoDate: string;
};

/**
 * Parse a month query string like "2026-04" into {year, month}. Month is
 * 1-indexed (1 = January). Returns null for invalid input so the caller
 * can fall back to the current month.
 */
export function parseMonthParam(
  raw: string | null,
): { year: number; month: number } | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

/** Inverse of parseMonthParam — zero-padded "YYYY-MM". */
export function formatMonthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Return {year, month} for the adjacent month. Handles year wrap.
 */
export function shiftMonth(
  year: number,
  month: number,
  delta: -1 | 1,
): { year: number; month: number } {
  const m0 = month - 1 + delta; // 0-indexed math
  const newYear = year + Math.floor(m0 / 12);
  const newMonth = (((m0 % 12) + 12) % 12) + 1;
  return { year: newYear, month: newMonth };
}

/**
 * Build a 6-row × 7-column grid (42 cells) for the given month. Rows
 * always start on Sunday. The first row includes spillover from the
 * previous month; the last row(s) from the next. Fixed height means the
 * UI doesn't jump between 5-row and 6-row months.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  today: Date = new Date(),
): { cells: GridCell[]; title: string } {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const weekdayOfFirst = firstOfMonth.getUTCDay(); // 0 = Sunday
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(firstOfMonth.getUTCDate() - weekdayOfFirst);

  const todayIso = toLocalIsoDate(today);
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const isoDate = toUtcIsoDate(d);
    cells.push({
      isoDate,
      day: d.getUTCDate(),
      inMonth:
        d.getUTCMonth() === month - 1 && d.getUTCFullYear() === year,
      isToday: isoDate === todayIso,
    });
  }

  const title = new Date(Date.UTC(year, month - 1, 1)).toLocaleString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  return { cells, title };
}

/**
 * Materialize raw CalendarEntry rows into per-day instances for the given
 * visible grid range (inclusive). Returns a Map keyed by ISO date.
 * - Annual entries are stamped at their month+day for every calendar year
 *   that intersects the grid (usually 1, up to 2 at year boundaries).
 * - One-time entries are included if their stored date falls inside the
 *   grid.
 *
 * Entries within a single day are sorted annual-first (birthdays tend to
 * headline the day) then alphabetical by title, so the rendered chip
 * order is deterministic.
 */
export function expandEntriesForGrid(
  entries: readonly Pick<
    CalendarEntry,
    "id" | "title" | "description" | "tags" | "recurrence" | "date"
  >[],
  gridStartIso: string,
  gridEndIso: string,
): Map<string, ExpandedEntry[]> {
  const byDate = new Map<string, ExpandedEntry[]>();

  const startYear = Number(gridStartIso.slice(0, 4));
  const endYear = Number(gridEndIso.slice(0, 4));

  for (const entry of entries) {
    const instances: string[] = [];

    if (entry.recurrence === "annual") {
      const mm = String(entry.date.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(entry.date.getUTCDate()).padStart(2, "0");
      for (let y = startYear; y <= endYear; y++) {
        instances.push(`${y}-${mm}-${dd}`);
      }
    } else {
      instances.push(toUtcIsoDate(entry.date));
    }

    for (const iso of instances) {
      if (iso < gridStartIso || iso > gridEndIso) continue;
      const list = byDate.get(iso) ?? [];
      list.push({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        tags: entry.tags,
        recurrence: entry.recurrence,
        isoDate: iso,
      });
      byDate.set(iso, list);
    }
  }

  for (const list of byDate.values()) {
    list.sort((a, b) => {
      if (a.recurrence !== b.recurrence) {
        return a.recurrence === "annual" ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
  }

  return byDate;
}

function toUtcIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
