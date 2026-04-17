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

// Page chrome matches the rest of the portal (max-w-5xl container, site-
// standard h1 scale/weight, eyebrow label). The editorial typographic
// treatment that used to live here (oversized month + trailing year) was
// pulled intentionally — it was the visual outlier across the portal and
// broke the "every page feels like the same product" rule. The grid itself
// still carries the editorial weight via scale + whitespace inside cells.
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pt-20 md:pt-8">
      {/* Header mirrors the admin layout pattern (eyebrow + h1, no bottom
          border) so moving between modules feels like one product. */}
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
          Calendar
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50">
          {title}
        </h1>

        <nav
          aria-label="Month navigation"
          className="mt-4 flex items-center gap-6 text-xs font-semibold uppercase tracking-[0.2em]"
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
