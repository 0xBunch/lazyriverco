import "server-only";
import ical, {
  type CalendarComponent,
  type EventInstance,
  type ParameterValue,
  type VEvent,
} from "node-ical";
import { assertUrlSafePublic } from "@/lib/safe-fetch";
import type { CalendarProviderHandler, SyncedEvent } from "./types";

// iCal/ICS subscription handler. Pasted .ics URL → parsed via node-ical
// → expanded RRULE → upserted as SyncedEvents.
//
// Why we don't use node-ical's `fromURL`: it calls `fetch` internally
// without our SSRF preflight. Instead we fetch the body ourselves
// (assertUrlSafePublic + plain fetch — the same pattern feed-poller.ts
// uses for RSS) then hand the string to ical.sync.parseICS.
//
// Horizon: 90 days. Recurring events (RRULE) get expanded over
// [today-7d, today+90d]; the small backfill window catches "this past
// Sunday" so the calendar's list view stays useful for the recent past.
//
// Source string: `ical:<feedId>` — multiple ICAL_URL feeds need
// distinct (source, externalId) tuples, so source carries feed identity.
// externalId: `${VEVENT.uid}-${date}` so each recurring instance gets
// its own row.

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const HORIZON_FORWARD_DAYS = 90;
const HORIZON_BACKWARD_DAYS = 7;
const UA =
  "Mozilla/5.0 (compatible; LazyRiverBot/1.0; +https://lazyriver.co)";

export const fetchIcalUrl: CalendarProviderHandler = async (feed) => {
  if (!feed.url || feed.url.includes("{yr}")) {
    throw new Error(
      `ICAL_URL feed "${feed.name}" has invalid URL: ${JSON.stringify(feed.url)}`,
    );
  }

  const body = await fetchIcsBody(feed.url);
  const parsed = ical.sync.parseICS(body);

  const now = new Date();
  const horizonStart = addDays(now, -HORIZON_BACKWARD_DAYS);
  const horizonEnd = addDays(now, HORIZON_FORWARD_DAYS);
  const source = `ical:${feed.id}`;

  const out: SyncedEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (!isVEvent(component)) continue;
    const event = component;
    if (event.status === "CANCELLED") continue;

    if (event.rrule) {
      // Recurring — expand into instances over the horizon. node-ical
      // handles RRULE semantics + EXDATE + RECURRENCE-ID overrides.
      let instances: EventInstance[];
      try {
        instances = ical.expandRecurringEvent(event, {
          from: horizonStart,
          to: horizonEnd,
        });
      } catch (e) {
        console.error(
          `[ical] expand failed for ${event.uid}:`,
          e instanceof Error ? e.message : String(e),
        );
        continue;
      }
      for (const inst of instances) {
        const synced = instanceToSynced(inst, event, source);
        if (synced) out.push(synced);
      }
      continue;
    }

    // Non-recurring — emit one row if it falls in the horizon.
    const start = event.start;
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) continue;
    if (start < horizonStart || start > horizonEnd) continue;
    const synced = vEventToSynced(event, source);
    if (synced) out.push(synced);
  }

  return out;
};

// ---------------------------------------------------------------------------

async function fetchIcsBody(url: string): Promise<string> {
  await assertUrlSafePublic(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/calendar, application/calendar+xml, text/plain;q=0.9",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`ICS fetch ${url} → ${res.status}`);
    }
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new Error(
        `ICS body exceeds ${MAX_BODY_BYTES} bytes (${text.length})`,
      );
    }
    if (!text.includes("BEGIN:VCALENDAR")) {
      // ICS validity tripwire — distinguishes "the URL returned HTML
      // because we hit a CDN error page" from "the calendar is empty."
      throw new Error("Response does not look like iCalendar (no VCALENDAR)");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// Type predicate centralises the one cast we need against node-ical's
// CalendarComponent union (which doesn't expose `type` as a discriminant
// cleanly). One place to update if node-ical ever ships a real
// discriminator.
function isVEvent(c: CalendarComponent | undefined): c is VEvent {
  return !!c && (c as { type?: string }).type === "VEVENT";
}

// `datetype === "date"` is node-ical's flag for an all-day event on the
// VEvent itself (no time component). EventInstance carries `isFullDay`
// directly. Centralised so both code paths agree on the rule.
function isFullDayEvent(event: VEvent): boolean {
  return (event as { datetype?: string }).datetype === "date";
}

function instanceToSynced(
  inst: EventInstance,
  base: VEvent,
  source: string,
): SyncedEvent | null {
  const start = inst.start;
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  const date = utcDateString(start);
  // `inst.summary` and `inst.event` respect RECURRENCE-ID overrides —
  // a single instance with its own SUMMARY/DESCRIPTION (e.g. "next
  // week's standup is special") shows that override, not the base.
  // Reading description from `inst.event.description` instead of
  // `base.description` is the fix for that.
  const overrideEvent = inst.event;
  const title = paramValueToString(inst.summary) || untitledFallback(base);
  const description =
    paramValueToString(overrideEvent.description) || null;

  return {
    source,
    externalId: `${base.uid}-${date}`,
    title,
    date,
    time: inst.isFullDay ? null : formatLocalTime(start),
    description: truncate(description, 190),
    body: description,
    tags: ["ical"],
  };
}

function vEventToSynced(event: VEvent, source: string): SyncedEvent | null {
  const start = event.start;
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  const date = utcDateString(start);
  const title = paramValueToString(event.summary) || untitledFallback(event);
  const description = paramValueToString(event.description) || null;

  return {
    source,
    externalId: `${event.uid}-${date}`,
    title,
    date,
    time: isFullDayEvent(event) ? null : formatLocalTime(start),
    description: truncate(description, 190),
    body: description,
    tags: ["ical"],
  };
}

function untitledFallback(event: VEvent): string {
  return event.uid ? `Untitled (${event.uid.slice(0, 8)})` : "Untitled";
}

function paramValueToString<T extends string | undefined>(
  v: ParameterValue<T> | undefined,
): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "val" in v && typeof v.val === "string") {
    return v.val;
  }
  return "";
}

function utcDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLocalTime(d: Date): string {
  // ICS files often carry a TZID we'd lose by formatting in our server's
  // local zone. For simplicity in v1, format in UTC with a UTC marker —
  // accurate, if not as friendly as local time. Future work: respect
  // event.start.tz if present.
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m} UTC`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
