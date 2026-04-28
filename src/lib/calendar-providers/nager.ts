import "server-only";
import { fetchJson, pad2, slug } from "./fetch";
import type { CalendarProviderHandler, SyncedEvent } from "./types";

// US public holidays via date.nager.at (free, no key, no rate limit).
// API doc: https://date.nager.at — returns one JSON array per (year,
// country) covering federal holidays + observances.
//
// Scope: this year + next year. The cron runs daily so the next year
// rolls in seamlessly on Jan 1. We drop region-specific holidays
// (`global: false`) since this is a single shared calendar, not per-state.
//
// `feed` argument is ignored — Feed.url for built-ins is identity-only.
// The handler constructs its own real URL with the current year and
// runs assertUrlSafePublic via fetchJson.
//
// Observance vs literal: Nager returns the FEDERAL OBSERVANCE date for
// fixed-date holidays — i.e. when Independence Day falls on a Saturday,
// it reports July 3 (the Friday observance). For a personal/lifestyle
// calendar this is wrong-feeling: you want "America 250 is Saturday
// July 4," not "Independence Day moved to Friday." Apple's iCloud
// Holidays + Google's "Holidays in United States" both show literal
// dates. We snap the five fixed-date federal holidays back to their
// canonical day (Jan 1, Jun 19, Jul 4, Nov 11, Dec 25); float-rule
// holidays (MLK = 3rd Mon Jan, etc.) pass through unchanged.

const SOURCE = "nager-us";

type NagerHoliday = {
  date: string; // "YYYY-MM-DD"
  localName: string;
  name: string;
  global: boolean;
  types?: string[];
};

// Map Nager's `name` (English, stable) to the literal MM-DD that the
// holiday actually falls on. If a Nager date doesn't match the literal
// MM-DD, we override with the literal so the calendar shows the
// observed-on-the-day date, not the federal-observance shifted one.
const FIXED_DATE_HOLIDAYS: Record<string, { mm: number; dd: number }> = {
  "New Year's Day": { mm: 1, dd: 1 },
  "Juneteenth National Independence Day": { mm: 6, dd: 19 },
  "Independence Day": { mm: 7, dd: 4 },
  "Veterans Day": { mm: 11, dd: 11 },
  "Christmas Day": { mm: 12, dd: 25 },
};

export const fetchNager: CalendarProviderHandler = async (_feed) => {
  const now = new Date();
  const years = [now.getUTCFullYear(), now.getUTCFullYear() + 1];
  const out: SyncedEvent[] = [];

  for (const year of years) {
    const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/US`;
    const holidays = await fetchJson<NagerHoliday[]>(url);
    // Defensive guard: an upstream outage / error envelope (e.g.
    // `{ error: "..." }`) would otherwise throw mid-iteration and lose
    // the entire year's data. Skip with a log so the other year still
    // syncs.
    if (!Array.isArray(holidays)) {
      console.error(`[nager] ${year}: response was not an array`);
      continue;
    }
    for (const h of holidays) {
      if (!h.global) continue;
      if (!h.date || !h.localName) continue;
      const date = literalDateOrPassthrough(h, year);
      // externalId is year-anchored (not date-anchored). Within a given
      // year, holiday name is unique. If Nager (or our literal-date
      // override) ever shifts the day for a holiday, the row updates in
      // place instead of orphaning. Was previously `${date}-${slug}` —
      // changed when the literal-date override was added; cleanup
      // migration drops the old Jul-3 Independence Day style rows so
      // the next poll inserts cleanly.
      out.push({
        source: SOURCE,
        externalId: `${year}-${slug(h.name)}`,
        title: h.localName,
        date,
        tags: ["holiday"],
      });
    }
  }

  return out;
};

// If the holiday is in FIXED_DATE_HOLIDAYS and Nager's reported date
// disagrees with the literal MM-DD, return the literal date. Otherwise
// return Nager's date as-is (correct for float-rule holidays like MLK
// Day, and for fixed-date holidays in years where the date already
// matches the literal).
function literalDateOrPassthrough(h: NagerHoliday, year: number): string {
  const fixed = FIXED_DATE_HOLIDAYS[h.name];
  if (!fixed) return h.date;
  const literal = `${year}-${pad2(fixed.mm)}-${pad2(fixed.dd)}`;
  return literal;
}
