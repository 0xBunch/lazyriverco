import "server-only";

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

export type ProviderResult = {
  provider: string;
  upserted: number;
  errors: string[];
};

export interface CalendarProvider {
  readonly name: string;
  fetch(): Promise<SyncedEvent[]>;
}
