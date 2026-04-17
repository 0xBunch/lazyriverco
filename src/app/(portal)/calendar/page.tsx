import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CalendarMonthGrid } from "@/components/CalendarMonthGrid";
import {
  buildMonthGrid,
  expandEntriesForGrid,
  formatMonthParam,
  parseMonthParam,
  shiftMonth,
} from "@/lib/calendar-grid";

// Aesthetic references (committed so future edits don't drift):
//   - Soho House monthly member bulletin (oversized month title, restrained chrome)
//   - Apartamento contributor index (scale + whitespace as the typography move)
//   - NOT Google Calendar / Outlook — reject bordered widgets, chip legends,
//     equal-weight grid cells that all shout at the same volume.
//
// Server-driven month navigation — the URL is the source of truth
// (`/calendar?m=2026-04`), so there's no client state to hydrate and
// every view is cacheable if we ever want to turn that on. `dynamic`
// is forced because admin mutations don't revalidate this path; we'd
// rather re-query than show stale data on every visit.

export const dynamic = "force-dynamic";

type SearchParams = { m?: string };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const now = new Date();

  const parsed = parseMonthParam(params.m ?? null);
  const year = parsed?.year ?? now.getFullYear();
  const month = parsed?.month ?? now.getMonth() + 1;

  const { cells, title } = buildMonthGrid(year, month, now);
  const gridStartIso = cells[0]!.isoDate;
  const gridEndIso = cells[cells.length - 1]!.isoDate;

  const entries = await prisma.calendarEntry.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      tags: true,
      recurrence: true,
      date: true,
    },
  });

  const eventsByDate = expandEntriesForGrid(entries, gridStartIso, gridEndIso);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const currentMonthParam = formatMonthParam(
    now.getFullYear(),
    now.getMonth() + 1,
  );
  const viewMonthParam = formatMonthParam(year, month);
  const isCurrentMonth = viewMonthParam === currentMonthParam;

  // Split the long month title on the space so "April" and "2026" can be
  // treated as distinct typographic moves: month name is the hero, year
  // trails it at a lighter weight. Keeps us in one family (DM Sans) while
  // still letting scale + weight do editorial work.
  const [monthWord, yearWord] = title.split(" ");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pt-20 md:pt-8">
      {/* Header — scale and whitespace carry the editorial weight. No
          bordered widget around the nav; three inline links, generously
          spaced, under the title. No italic subtitle — the eyebrow + the
          title do the work. */}
      <header className="mb-10 border-b border-bone-800 pb-8">
        <p className="text-[0.65rem] uppercase tracking-[0.25em] text-claude-300">
          The Lazy River Co. — Calendar
        </p>
        <h1 className="mt-3 text-balance font-display text-6xl font-light tracking-tight text-bone-50 md:text-7xl">
          <span className="font-semibold">{monthWord}</span>
          {yearWord ? (
            <span className="ml-3 text-bone-400">{yearWord}</span>
          ) : null}
        </h1>

        <nav
          aria-label="Month navigation"
          className="mt-5 flex items-center gap-6 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          <Link
            href={`/calendar?m=${formatMonthParam(prev.year, prev.month)}`}
            aria-label={`Previous month (${formatMonthParam(prev.year, prev.month)})`}
            className="text-bone-300 transition-colors hover:text-bone-50 focus:outline-none focus-visible:text-claude-300"
          >
            ← Prev
          </Link>
          {!isCurrentMonth ? (
            <Link
              href="/calendar"
              className="text-bone-300 transition-colors hover:text-bone-50 focus:outline-none focus-visible:text-claude-300"
            >
              Today
            </Link>
          ) : (
            <span
              aria-current="page"
              className="text-claude-300"
            >
              Today
            </span>
          )}
          <Link
            href={`/calendar?m=${formatMonthParam(next.year, next.month)}`}
            aria-label={`Next month (${formatMonthParam(next.year, next.month)})`}
            className="text-bone-300 transition-colors hover:text-bone-50 focus:outline-none focus-visible:text-claude-300"
          >
            Next →
          </Link>
        </nav>
      </header>

      {/* Horizontal scroll lane for narrow viewports — the grid becomes
          unusable under ~640px, so let users pan it instead of crushing
          the cells. Desktop users never see the scrollbar. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[42rem]">
          <CalendarMonthGrid cells={cells} eventsByDate={eventsByDate} />
        </div>
      </div>

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
