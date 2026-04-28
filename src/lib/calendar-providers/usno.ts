import "server-only";
import { fetchJson, pad2, slug } from "./fetch";
import type { CalendarProvider, SyncedEvent } from "./types";

// US Naval Observatory astronomy data. Free, no key, government-run.
// API doc: https://aa.usno.navy.mil/data/api
//
// Two endpoints:
//   - /api/moon/phases/year — full year of moon phase events
//   - /api/seasons          — solstices + equinoxes for a year
//
// Filters down to full moons + new moons + the four seasonal markers —
// the celestial events someone might glance at the calendar and want to
// know about. The other quarter-moon phases would just be noise.
//
// Time is reported in UTC. We display it as "HH:MM UTC" rather than
// converting to ET; for someone glancing at the calendar, "the moon is
// full sometime today" is the useful bit.
//
// Per-endpoint failures are caught locally so one year's data missing
// doesn't kill the whole provider's sync.

const SOURCE_MOON = "usno-moon";
const SOURCE_SEASON = "usno-season";

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

type USNOSeason = {
  year: number;
  month: number;
  day: number;
  // USNO returns generic terms here: "Equinox", "Solstice", "Perihelion",
  // "Aphelion". We filter to the two seasonal markers and synthesize a
  // hemisphere-aware title (e.g. "Spring Equinox") from month.
  phenom: string;
  time: string;
};

type USNOSeasonsResponse = {
  data?: USNOSeason[];
};

export const usnoProvider: CalendarProvider = {
  name: "usno",
  async fetch() {
    const now = new Date();
    const years = [now.getUTCFullYear(), now.getUTCFullYear() + 1];
    const out: SyncedEvent[] = [];

    for (const year of years) {
      try {
        const moonUrl = `https://aa.usno.navy.mil/api/moon/phases/year?year=${year}`;
        const r = await fetchJson<USNOMoonResponse>(moonUrl);
        const phases = Array.isArray(r.phasedata) ? r.phasedata : [];
        for (const p of phases) {
          if (p.phase !== "Full Moon" && p.phase !== "New Moon") continue;
          const date = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
          out.push({
            source: SOURCE_MOON,
            externalId: `${date}-${slug(p.phase)}`,
            title: p.phase,
            date,
            time: p.time ? `${p.time} UTC` : null,
            tags: ["astronomy", "moon"],
          });
        }
      } catch (e) {
        console.error(`[usno] moon ${year}:`, e);
      }

      try {
        const seasonsUrl = `https://aa.usno.navy.mil/api/seasons?year=${year}`;
        const r = await fetchJson<USNOSeasonsResponse>(seasonsUrl);
        const seasons = Array.isArray(r.data) ? r.data : [];
        for (const s of seasons) {
          if (s.phenom !== "Equinox" && s.phenom !== "Solstice") continue;
          const title = seasonalTitle(s.phenom, s.month);
          if (!title) continue;
          const date = `${s.year}-${pad2(s.month)}-${pad2(s.day)}`;
          out.push({
            source: SOURCE_SEASON,
            externalId: `${date}-${slug(title)}`,
            title,
            date,
            time: s.time ? `${s.time} UTC` : null,
            tags: ["astronomy", "season"],
          });
        }
      } catch (e) {
        console.error(`[usno] seasons ${year}:`, e);
      }
    }

    return out;
  },
};

// Northern-hemisphere mapping. KB is US-based; if this ever surfaces a
// Southern-hemisphere user the labels would invert.
function seasonalTitle(
  phenom: "Equinox" | "Solstice",
  month: number,
): string | null {
  if (phenom === "Equinox") {
    if (month === 3) return "Spring Equinox";
    if (month === 9) return "Autumn Equinox";
    return null;
  }
  if (month === 6) return "Summer Solstice";
  if (month === 12) return "Winter Solstice";
  return null;
}
