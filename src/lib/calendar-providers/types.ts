import "server-only";
import type { Feed } from "@prisma/client";

// Shape every calendar-sync provider produces. Date is ISO "YYYY-MM-DD"
// (calendar-day, no TZ) to match CalendarEntry.date's @db.Date storage.
// Time is the same free-form string convention as the manual entry form
// ("7:00 PM ET", "Noon", "10:03 UTC") — list view shows it, grid ignores.
export type SyncedEvent = {
  source: string;
  externalId: string;
  title: string;
  date: string;
  time?: string | null;
  description?: string | null;
  body?: string | null;
  tags: string[];
};

// Narrow view of Feed passed to handlers. We don't pass the full Feed
// row — only what handlers might legitimately read (URL for ICAL_URL,
// id for the source-string convention used by ICAL_URL feeds, name for
// error messages). Prevents handlers from reaching into health/poll
// state that's the poller's concern.
export type CalendarFeedRow = Pick<Feed, "id" | "url" | "name">;

// Per-provider handler. Returns the events it found; errors that
// shouldn't kill the whole poll get logged via console.error inside
// the handler. Throws only for catastrophic failure (e.g. network +
// parse both fail) — the caller wraps that into a PollOutcome.
export type CalendarProviderHandler = (
  feed: CalendarFeedRow,
) => Promise<SyncedEvent[]>;
