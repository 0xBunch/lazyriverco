import "server-only";
import { fetchJson, pad2 } from "./fetch";
import type { CalendarProviderHandler, SyncedEvent } from "./types";

// NFL schedule via ESPN's public site API (unofficial but stable; the
// same surface the espn.com scoreboard reads from). No key, no quota
// observed. Pulls the next 90 days of games and aggregates per ET-day
// into one entry per (league, date), so a Sunday with 13 games shows
// as one chip — "NFL — 13 games" — instead of overflowing the cell's
// 3-chip cap.
//
// ET is the right anchor: NFL scheduling is ET-anchored ("Sunday 1 PM"
// always means 1 PM Eastern), and the fan base skews east-of-Pacific.
// A Pacific user seeing a Sunday-9 AM game still thinks of it as
// happening on Sunday — same as in our calendar.
//
// Empty results during the offseason are normal; the cron will start
// finding games once the upcoming season's schedule is published
// (typically mid-May for the regular season).

const SOURCE = "espn-nfl";
const HORIZON_DAYS = 90;

type ESPNCompetitor = {
  homeAway?: "home" | "away";
  team?: { abbreviation?: string; shortDisplayName?: string };
};

type ESPNCompetition = {
  competitors?: ESPNCompetitor[];
  status?: { type?: { name?: string; description?: string } };
};

type ESPNEvent = {
  id: string;
  date?: string; // UTC ISO
  shortName?: string; // "BUF @ KC"
  name?: string;
  competitions?: ESPNCompetition[];
};

type ESPNScoreboardResponse = {
  events?: ESPNEvent[];
};

export const fetchEspnNfl: CalendarProviderHandler = async (_feed) => {
  const today = new Date();
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + HORIZON_DAYS);
  const dates = `${ymdCompact(today)}-${ymdCompact(end)}`;
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=200`;

  const r = await fetchJson<ESPNScoreboardResponse>(url);
  const games = Array.isArray(r.events) ? r.events : [];

  // Aggregate by ET-anchored calendar date. If a game gets postponed
  // and re-scheduled to a different day, the next sync will write a new
  // row keyed on the new ET date and leave the old one as a "ghost"
  // (no longer in upstream). Acceptable for v1; a "drop synced rows
  // not in latest payload" pass is future work.
  const byDate = new Map<string, ESPNEvent[]>();
  for (const ev of games) {
    if (!ev.date) continue;
    const date = utcIsoToEtDate(ev.date);
    if (!date) continue;
    const list = byDate.get(date) ?? [];
    list.push(ev);
    byDate.set(date, list);
  }

  const out: SyncedEvent[] = [];
  for (const [date, evs] of byDate) {
    const matchups = evs
      .map((e) => e.shortName?.trim())
      .filter((s): s is string => Boolean(s));
    const title =
      matchups.length === 1
        ? `NFL: ${matchups[0]}`
        : `NFL — ${evs.length} games`;
    const description =
      matchups.length === 1
        ? null
        : truncate(
            matchups.slice(0, 6).join(" • ") +
              (matchups.length > 6 ? ` +${matchups.length - 6}` : ""),
            190,
          );
    const body = evs
      .map((e) => {
        const matchup = e.shortName ?? e.name ?? "TBD";
        const t = e.date ? formatEtTime(e.date) : null;
        return t ? `- ${matchup} (${t})` : `- ${matchup}`;
      })
      .join("\n");

    out.push({
      source: SOURCE,
      externalId: `day-${date}`,
      title,
      date,
      description,
      body,
      tags: ["nfl", "sports"],
    });
  }

  return out;
};

function ymdCompact(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

// "2026-09-13T17:00Z" + America/New_York → "2026-09-13"
// en-CA locale formats as YYYY-MM-DD natively.
function utcIsoToEtDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatEtTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d) + " ET"
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
