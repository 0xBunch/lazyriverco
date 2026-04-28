import { prisma } from "@/lib/prisma";
import {
  CalendarEntriesTable,
  type CalendarEntryRow,
  type CalendarGroups,
} from "./_components/CalendarEntriesTable";

export const dynamic = "force-dynamic";

// Bucket window boundaries. Values here are UX choices, not invariants —
// tweak freely, the client component just renders what it's handed.
const UPCOMING_DAYS = 30;
const PAST_DAYS = 90;

export default async function AdminCalendarPage() {
  const entries = await prisma.calendarEntry.findMany({
    // `orderBy` doesn't matter for display (the client groups by effective
    // date and sorts within each bucket); we just need the full set.
    orderBy: { date: "asc" },
    include: { _count: { select: { media: true } } },
  });

  const todayUtc = startOfTodayUtc();
  const upcomingEdge = dayOffset(todayUtc, UPCOMING_DAYS);
  const pastEdge = dayOffset(todayUtc, -PAST_DAYS);

  const decorated: Array<CalendarEntryRow & { effective: Date }> = entries
    .map((e) => {
      const effective = effectiveDate(
        { date: e.date, recurrence: e.recurrence },
        todayUtc,
      );
      return {
        id: e.id,
        title: e.title,
        dateIso: toIsoDate(e.date),
        effectiveDateIso: toIsoDate(effective),
        recurrence:
          e.recurrence === "annual" ? ("annual" as const) : ("none" as const),
        time: e.time,
        tags: e.tags,
        description: e.description,
        hasBody: !!e.body && e.body.trim().length > 0,
        hasVideo: !!e.videoEmbedUrl && e.videoEmbedUrl.trim().length > 0,
        hasMedia: e._count.media > 0,
        effective,
      };
    })
    .sort((a, b) => a.effective.getTime() - b.effective.getTime());

  const groups: CalendarGroups = {
    upcoming: [],
    later: [],
    past: [],
    older: [],
  };

  for (const entry of decorated) {
    const t = entry.effective.getTime();
    const { effective: _omit, ...row } = entry;
    if (t < pastEdge.getTime()) groups.older.push(row);
    else if (t < todayUtc.getTime()) groups.past.push(row);
    else if (t <= upcomingEdge.getTime()) groups.upcoming.push(row);
    else groups.later.push(row);
  }

  // Past rows read newest-first (most recently past on top) so the admin
  // scans the last week before the last 90 days. `decorated` is ascending
  // by effective date, so reverse just the past/older buckets.
  groups.past.reverse();
  groups.older.reverse();

  const totals = {
    total: entries.length,
    upcoming: groups.upcoming.length,
    recurring: entries.filter((e) => e.recurrence === "annual").length,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-bone-300">
            Birthdays, cultural moments, trip dates, games. Dates within 7 days
            are auto-injected into agent prompts; annual entries repeat every
            year. Members see a read-only view at{" "}
            <a
              href="/calendar"
              className="underline decoration-claude-500/40 underline-offset-2 hover:text-bone-50"
            >
              /calendar
            </a>
            .
          </p>
        </div>
        <a
          href="/admin/memory/feeds"
          className="rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700"
        >
          Manage feeds →
        </a>
      </header>

      <CalendarEntriesTable groups={groups} totals={totals} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date helpers (UTC-only — CalendarEntry.date is @db.Date, no TZ; matching
// that convention here prevents "Jun 2" from silently becoming "Jun 1" in
// negative-offset render paths).

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function dayOffset(anchor: Date, days: number): Date {
  return new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function effectiveDate(
  entry: { date: Date; recurrence: string },
  todayUtc: Date,
): Date {
  if (entry.recurrence !== "annual") return entry.date;
  // Annual entries are stored with their original year (e.g. 1985 for a
  // birthday); the "effective" date is the next occurrence — this year if
  // it's still ahead of today, otherwise next year.
  const month = entry.date.getUTCMonth();
  const day = entry.date.getUTCDate();
  const thisYear = new Date(
    Date.UTC(todayUtc.getUTCFullYear(), month, day),
  );
  if (thisYear.getTime() >= todayUtc.getTime()) return thisYear;
  return new Date(Date.UTC(todayUtc.getUTCFullYear() + 1, month, day));
}
