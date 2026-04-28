import "server-only";
import { fetchJson, slug } from "./fetch";
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

const SOURCE = "nager-us";

type NagerHoliday = {
  date: string; // "YYYY-MM-DD"
  localName: string;
  name: string;
  global: boolean;
  types?: string[];
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
      out.push({
        source: SOURCE,
        externalId: `${h.date}-${slug(h.name)}`,
        title: h.localName,
        date: h.date,
        tags: ["holiday"],
      });
    }
  }

  return out;
};
