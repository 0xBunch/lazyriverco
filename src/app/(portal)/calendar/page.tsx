import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CalendarMonthGrid } from "@/components/CalendarMonthGrid";
import { CalendarUpcomingList } from "@/components/CalendarUpcomingList";
import {
  CalendarViewTabs,
  type CalendarView,
} from "@/components/CalendarViewTabs";
import {
  buildMonthGrid,
  expandEntriesForGrid,
  formatMonthParam,
  getUpcomingEntries,
  parseMonthParam,
  shiftMonth,
  toLocalIsoDate,
} from "@/lib/calendar-grid";

// Two views behind one URL:
//   ?v=calendar → month grid
//   ?v=list     → next 20 upcoming
//   (no ?v=)    → list on <sm (phones), calendar on sm:+ (CSS toggle)
// Server-driven, no client state, no hydration flicker. Month param (?m=)
// only applies in calendar view; list view ignores it and is unlimited
// by month.

export const dynamic = "force-dynamic";

const UPCOMING_LIMIT = 20;

type SearchParams = { m?: string; v?: string };

function parseView(raw: string | undefined): CalendarView | null {
  if (raw === "calendar" || raw === "list") return raw;
  return null;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const now = new Date();

  const view = parseView(params.v);

  const parsed = parseMonthParam(params.m ?? null);
  const year = parsed?.year ?? now.getFullYear();
  const month = parsed?.month ?? now.getMonth() + 1;

  const entries = await prisma.calendarEntry.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      tags: true,
      recurrence: true,
      date: true,
      time: true,
    },
  });

  const { cells } = buildMonthGrid(year, month, now);
  const gridStartIso = cells[0]!.isoDate;
  const gridEndIso = cells[cells.length - 1]!.isoDate;
  const eventsByDate = expandEntriesForGrid(entries, gridStartIso, gridEndIso);

  const upcoming = getUpcomingEntries(entries, UPCOMING_LIMIT, now);
  const todayIso = toLocalIsoDate(now);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const currentMonthParam = formatMonthParam(
    now.getFullYear(),
    now.getMonth() + 1,
  );
  const isCurrentMonth = formatMonthParam(year, month) === currentMonthParam;
  // Match the UTC storage model used by buildMonthGrid so the title
  // reflects the month the grid is actually rendering.
  const monthTitle = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  const showCalendar = view === "calendar" || view === null;
  const showList = view === "list" || view === null;

  const calendarBody = (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="min-w-[42rem]">
        <CalendarMonthGrid cells={cells} eventsByDate={eventsByDate} />
      </div>
    </div>
  );
  const listBody = (
    <CalendarUpcomingList entries={upcoming} todayIso={todayIso} />
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pt-20 md:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50">
          Calendar
        </h1>
      </header>

      <div className="mb-4">
        <CalendarViewTabs active={view} searchParams={params} />
      </div>

      {/* Month title + navigation — only shown when calendar is rendering.
          When no explicit ?v=, calendar is only visible on sm:+, so this
          block hides on mobile to avoid dangling controls over the list. */}
      {showCalendar ? (
        <div
          className={
            view === null
              ? "mb-4 hidden items-baseline justify-between gap-6 sm:flex"
              : "mb-4 flex items-baseline justify-between gap-6"
          }
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
            {monthTitle}
          </h2>
          <nav
            aria-label="Month navigation"
            className="flex items-baseline gap-6 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            <Link
              href={`/calendar?m=${formatMonthParam(prev.year, prev.month)}${view ? `&v=${view}` : ""}`}
              aria-label={`Previous month (${formatMonthParam(prev.year, prev.month)})`}
              className="text-bone-300 transition-colors hover:text-bone-50 focus:outline-none focus-visible:text-claude-300"
            >
              ← Prev
            </Link>
            {!isCurrentMonth ? (
              <Link
                href={view ? `/calendar?v=${view}` : "/calendar"}
                className="text-bone-300 transition-colors hover:text-bone-50 focus:outline-none focus-visible:text-claude-300"
              >
                Today
              </Link>
            ) : (
              <span aria-current="page" className="text-claude-300">
                Today
              </span>
            )}
            <Link
              href={`/calendar?m=${formatMonthParam(next.year, next.month)}${view ? `&v=${view}` : ""}`}
              aria-label={`Next month (${formatMonthParam(next.year, next.month)})`}
              className="text-bone-300 transition-colors hover:text-bone-50 focus:outline-none focus-visible:text-claude-300"
            >
              Next →
            </Link>
          </nav>
        </div>
      ) : null}

      {/* View bodies. Explicit ?v= renders one; no ?v= renders both
          behind a viewport CSS toggle. */}
      {view === "calendar" ? calendarBody : null}
      {view === "list" ? listBody : null}
      {view === null ? (
        <>
          <div className="sm:hidden">{listBody}</div>
          <div className="hidden sm:block">{calendarBody}</div>
        </>
      ) : null}

      {entries.length === 0 ? (
        <p className="mt-6 text-sm italic text-bone-300">
          No dates yet. An admin can add them from{" "}
          <Link
            href="/admin/calendar"
            className="underline decoration-claude-500/40 underline-offset-2 hover:text-bone-100 hover:decoration-claude-300"
          >
            the Commissioner Room
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
