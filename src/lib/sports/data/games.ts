// Pure read-only wrapper over the upstream provider clients. No
// Prisma, no env secrets, no fs — safe to call from anywhere
// (server components, scripts, the future Trigger.dev sync task).
// `server-only` is intentionally NOT imported here so the
// probe-scoreboard CLI can exercise this module from tsx. Re-add
// it when this file starts touching the DB or secrets — PR 2's
// sync.ts is the natural home for that.
import type { Game, League, Window } from "./types";
import { fetchEspnScoreboard, espnDatesForWindow } from "./providers/espn";
import { fetchMlbSchedule, mlbDatesForWindow } from "./providers/mlb";
import { normalizeEspn, normalizeMlb } from "./providers/normalize";

// Domain wrapper for the "games" data domain. Per the architecture
// review (2026-04-29), each domain in src/lib/sports/data/ exposes
// both its read AND write functions in the same file:
//   - getGames(league, window): fetch from upstream → normalized Game[]
//   - syncGames lives in PR 2 (sync.ts is the cross-domain orchestrator
//     for now; once a second domain ships, that file gets split per
//     domain too).
//
// The single normalized abstraction was KB's call (2026-04-29 round 2,
// option "Normalized `getGames(league)`"). Internally routes:
//   - league = "mlb" → MLB official statsapi (richest broadcasts)
//   - everything else → ESPN hidden API
//
// Throws on upstream / validation error. Caller (Trigger.dev task in
// PR 2, probe script in scripts/) is responsible for retry policy.
export async function getGames(
  league: League,
  window: Window,
  now: Date = new Date(),
): Promise<Game[]> {
  if (league === "mlb") {
    const dates = mlbDatesForWindow(window, now);
    const schedule = await fetchMlbSchedule(league, dates);
    const out: Game[] = [];
    for (const block of schedule.dates) {
      for (const g of block.games) {
        out.push(normalizeMlb(g, now));
      }
    }
    return filterByWindow(out, window, now);
  }

  // ESPN: NFL/NBA/NHL.
  const dates = espnDatesForWindow(window, now);
  const scoreboard = await fetchEspnScoreboard(league, { dates });
  const out: Game[] = scoreboard.events.map((e) => normalizeEspn(e, league, now));
  return filterByWindow(out, window, now);
}

function filterByWindow(games: Game[], window: Window, now: Date): Game[] {
  if (window === "live") {
    return games.filter((g) => g.status === "LIVE");
  }
  if (window === "today") {
    // ±18h centered on now to absorb timezone wobble (a 1pm ET game
    // crosses midnight UTC three hours later).
    const min = now.getTime() - 6 * 60 * 60 * 1000;
    const max = now.getTime() + 18 * 60 * 60 * 1000;
    return games.filter((g) => {
      const t = g.gameTime.getTime();
      return t >= min && t <= max;
    });
  }
  // window === "week": next 7 days. ESPN/MLB already constrained the
  // upstream query, but a narrow client filter handles edge cases.
  const min = now.getTime() - 6 * 60 * 60 * 1000;
  const max = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  return games.filter((g) => {
    const t = g.gameTime.getTime();
    return t >= min && t <= max;
  });
}

// Re-export the public types so consumers only need a single import.
export type { Game, League, Window } from "./types";
