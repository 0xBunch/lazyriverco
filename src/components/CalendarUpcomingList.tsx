import Link from "next/link";
import { cn } from "@/lib/utils";
import type { UpcomingEntry } from "@/lib/calendar-grid";

// Presentational list view for the next N upcoming events. Pairs with the
// month grid behind the ?v=list|calendar toggle. Date column on the left
// carries weekday + date + optional time; event column on the right
// carries title + optional description.
//
// Semantic choice: <ul>, not <table>. Content is a feed (same shape as a
// newsletter list), not tabular data with comparable columns — stacks
// cleanly on phones without fighting table layout.
//
// Today's row uses the same visual grammar as the month grid: a claude-
// filled rounded pill around the date, plus a claude left rule on the
// row. Matches `CalendarMonthGrid.tsx` so the two views feel like one
// product instead of two templates stapled together.

type Props = {
  entries: readonly UpcomingEntry[];
  /** ISO "YYYY-MM-DD" for today, used to highlight the top row(s). */
  todayIso: string;
};

export function CalendarUpcomingList({ entries, todayIso }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-bone-700 bg-bone-900 px-4 py-8 text-center">
        <p className="text-sm italic text-bone-300">
          No upcoming events.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-bone-800 overflow-hidden rounded-2xl border border-bone-700 bg-bone-900">
      {entries.map((entry) => {
        const isToday = entry.isoDate === todayIso;
        const { weekday, monthDay } = formatListDate(entry.isoDate);
        const isAnnual = entry.recurrence === "annual";

        return (
          <li key={`${entry.id}-${entry.isoDate}`}>
            <Link
              href={`/calendar/${entry.id}`}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "group flex items-start gap-4 px-4 py-3 transition-colors focus:outline-none focus-visible:bg-bone-800/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-claude-400 hover:bg-bone-800/40 sm:px-5 sm:py-4",
                isToday
                  ? "border-l-2 border-claude-500"
                  : "border-l-2 border-transparent",
              )}
            >
              {/* Date column — weekday above, date (claude pill when
                  today), optional time underneath. All "when"
                  information stays in one vertical strip. */}
              <div className="w-20 flex-none">
                <div className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-claude-300">
                  {weekday}
                </div>
                <div
                  className={cn(
                    "mt-0.5 inline-flex items-center rounded-full text-sm font-semibold tabular-nums sm:text-base",
                    isToday
                      ? "bg-claude-500 px-2 py-0.5 text-bone-950"
                      : "text-bone-50",
                  )}
                >
                  {monthDay}
                </div>
                {entry.time ? (
                  <div className="mt-0.5 text-xs tabular-nums text-bone-300">
                    {entry.time}
                  </div>
                ) : null}
              </div>

              {/* Event column. ↻ glyph for annuals matches the month
                  grid's treatment. Description is a muted subline when
                  present. */}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-1.5 text-sm font-medium text-bone-50 sm:text-base">
                  {isAnnual ? (
                    <span
                      className="text-claude-300"
                      aria-label="Recurs annually"
                    >
                      ↻
                    </span>
                  ) : null}
                  <span className="truncate">{entry.title}</span>
                </div>
                {entry.description ? (
                  <p className="mt-0.5 truncate text-xs text-bone-300 sm:text-sm">
                    {entry.description}
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Format an ISO date ("YYYY-MM-DD") into display parts.
 * Parsed in UTC to match the DB's date-only storage semantics — the grid
 * utility does the same. Don't swap this for `new Date(iso)` without UTC;
 * Safari has historically interpreted that as local-time midnight and
 * shifted the displayed day.
 */
function formatListDate(iso: string): {
  weekday: string;
  monthDay: string;
} {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return {
    weekday: date
      .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
      .toUpperCase(),
    monthDay: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}
