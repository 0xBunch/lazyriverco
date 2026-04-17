import { cn } from "@/lib/utils";
import type { ExpandedEntry, GridCell } from "@/lib/calendar-grid";

// Presentational only: takes pre-built cells + per-day event map and
// renders the 7×N grid. No state, no data fetching — the server page
// owns both. Keeps this file reusable if we ever want an alt view
// (e.g., smaller "mini-month" widget in a sidebar).
//
// Visual hierarchy: one-time events (trips, game days — the actionable
// happenings) carry the solid treatment with a claude-tinted left rule.
// Annual events (birthdays — standing reminders) are demoted to a ghost
// outline with the ↻ glyph. The critic's point: the trip is a thing
// *happening*; the birthday is a *reminder*. Treat them that way.

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_CELL = 3;

type Props = {
  cells: readonly GridCell[];
  eventsByDate: Map<string, ExpandedEntry[]>;
};

export function CalendarMonthGrid({ cells, eventsByDate }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-bone-700 bg-bone-900">
      {/* Weekday header strip */}
      <div
        className="grid grid-cols-7 border-b border-bone-700 bg-bone-900/70"
        role="row"
      >
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="px-3 py-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-bone-300"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7" role="grid">
        {cells.map((cell, i) => {
          const events = eventsByDate.get(cell.isoDate) ?? [];
          const visibleEvents = events.slice(0, MAX_CHIPS_PER_CELL);
          const overflow = events.length - visibleEvents.length;
          const colIndex = i % 7;
          const rowIndex = Math.floor(i / 7);
          const totalRows = Math.ceil(cells.length / 7);
          const isLastRow = rowIndex === totalRows - 1;

          return (
            <div
              key={cell.isoDate}
              role="gridcell"
              aria-label={`${cell.isoDate}${events.length > 0 ? `, ${events.length} event${events.length === 1 ? "" : "s"}` : ""}`}
              className={cn(
                "relative flex min-h-[7rem] flex-col border-bone-800 px-2 py-2 transition-colors",
                colIndex < 6 && "border-r",
                !isLastRow && "border-b",
                cell.inMonth ? "bg-bone-900" : "bg-bone-950/60",
                "hover:bg-bone-800/40",
              )}
            >
              {/* Date number. Spillover cells render no number at all —
                  per rams/design-oracle, bone-500 on bone-950/40 fails
                  WCAG and reads as "broken" rather than "muted." Empty
                  cells carry the out-of-month signal via bg shift alone. */}
              {cell.inMonth ? (
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums transition-colors",
                      cell.isToday
                        ? "bg-claude-500 text-bone-950"
                        : "text-bone-100",
                    )}
                  >
                    {cell.day}
                  </span>
                </div>
              ) : (
                <div className="mb-1.5 h-6" aria-hidden="true" />
              )}

              {/* Event chips. Only render on in-month cells — spillover
                  stays silent to let the current month dominate. */}
              {cell.inMonth && visibleEvents.length > 0 ? (
                <ul className="space-y-1">
                  {visibleEvents.map((event) => (
                    <li
                      key={`${event.id}-${event.isoDate}`}
                      className={cn(
                        "truncate rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium leading-tight",
                        event.recurrence === "annual"
                          ? // Annual = standing reminder → ghost outline
                            "border border-dashed border-claude-500/40 text-claude-100"
                          : // One-time = the thing actually happening →
                            // solid fill with claude left-rule for weight
                            "border-l-2 border-claude-500 bg-bone-800 text-bone-50",
                      )}
                      title={
                        event.description
                          ? `${event.title} — ${event.description}`
                          : event.title
                      }
                    >
                      {event.recurrence === "annual" ? (
                        <span
                          className="mr-1 text-claude-300"
                          aria-hidden="true"
                        >
                          ↻
                        </span>
                      ) : null}
                      {event.title}
                    </li>
                  ))}
                  {overflow > 0 ? (
                    <li className="px-1.5 pt-0.5 text-[0.65rem] italic text-bone-300">
                      +{overflow} more
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
