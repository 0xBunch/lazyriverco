import "server-only";
import { fetchJson, pad2, slug } from "./fetch";
import type { CalendarProviderHandler, SyncedEvent } from "./types";

// US Naval Observatory seasons (solstices + equinoxes).
// API: https://aa.usno.navy.mil/api/seasons?year=YYYY
//
// USNO returns generic terms ("Equinox", "Solstice", "Perihelion",
// "Aphelion"). We filter to the two seasonal markers and synthesize
// hemisphere-aware titles ("Spring Equinox" etc) from month. KB is
// US-based; if this ever surfaces a Southern-hemisphere user the
// labels would invert.

const SOURCE = "usno-season";

type USNOSeason = {
  year: number;
  month: number;
  day: number;
  phenom: string;
  time: string;
};

type USNOSeasonsResponse = {
  data?: USNOSeason[];
};

export const fetchUsnoSeason: CalendarProviderHandler = async (_feed) => {
  const now = new Date();
  const years = [now.getUTCFullYear(), now.getUTCFullYear() + 1];
  const out: SyncedEvent[] = [];

  for (const year of years) {
    try {
      const url = `https://aa.usno.navy.mil/api/seasons?year=${year}`;
      const r = await fetchJson<USNOSeasonsResponse>(url);
      const seasons = Array.isArray(r.data) ? r.data : [];
      for (const s of seasons) {
        if (s.phenom !== "Equinox" && s.phenom !== "Solstice") continue;
        const title = seasonalTitle(s.phenom, s.month);
        if (!title) continue;
        const date = `${s.year}-${pad2(s.month)}-${pad2(s.day)}`;
        out.push({
          source: SOURCE,
          externalId: `${date}-${slug(title)}`,
          title,
          date,
          time: s.time ? `${s.time} UTC` : null,
          tags: ["astronomy", "season"],
        });
      }
    } catch (e) {
      console.error(`[usno-season] ${year}:`, e);
    }
  }

  return out;
};

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
