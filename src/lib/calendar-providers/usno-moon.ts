import "server-only";
import { fetchJson, pad2, slug } from "./fetch";
import type { CalendarProviderHandler, SyncedEvent } from "./types";

// US Naval Observatory moon phases. Free, no key, government-run.
// API: https://aa.usno.navy.mil/api/moon/phases/year?year=YYYY
//
// Filters to Full Moon + New Moon only — quarter-moons would be noise
// on a calendar at 4 events/month per quarter. Time is reported in
// UTC; we display "HH:MM UTC" rather than converting to ET (the
// useful bit is "the moon is full sometime today").
//
// Per-year failures are caught locally so one year's data missing
// doesn't kill the whole sync.
//
// USNO Seasons (solstices / equinoxes) lives in usno-season.ts —
// split because each maps to a separate Feed row, giving each its own
// health chip + breaker so a moon-phase outage doesn't shadow seasons.

const SOURCE = "usno-moon";

type USNOMoonPhase = {
  year: number;
  month: number;
  day: number;
  phase: string; // "New Moon" | "First Quarter" | "Full Moon" | "Last Quarter"
  time: string; // "HH:MM" UTC
};

type USNOMoonResponse = {
  phasedata?: USNOMoonPhase[];
};

export const fetchUsnoMoon: CalendarProviderHandler = async (_feed) => {
  const now = new Date();
  const years = [now.getUTCFullYear(), now.getUTCFullYear() + 1];
  const out: SyncedEvent[] = [];

  for (const year of years) {
    try {
      const url = `https://aa.usno.navy.mil/api/moon/phases/year?year=${year}`;
      const r = await fetchJson<USNOMoonResponse>(url);
      const phases = Array.isArray(r.phasedata) ? r.phasedata : [];
      for (const p of phases) {
        if (p.phase !== "Full Moon" && p.phase !== "New Moon") continue;
        const date = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
        out.push({
          source: SOURCE,
          externalId: `${date}-${slug(p.phase)}`,
          title: p.phase,
          date,
          time: p.time ? `${p.time} UTC` : null,
          tags: ["astronomy", "moon"],
        });
      }
    } catch (e) {
      console.error(`[usno-moon] ${year}:`, e);
    }
  }

  return out;
};
