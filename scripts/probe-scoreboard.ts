// One-off probe for the sports data layer's provider clients. Hits
// the upstream provider for the given league and prints the normalized
// Game[] as JSON. Does NOT write to the database — pure read.
//
// Usage:
//   pnpm exec tsx scripts/probe-scoreboard.ts <nfl|nba|mlb|nhl> [live|today|week]
//
// Examples:
//   pnpm exec tsx scripts/probe-scoreboard.ts nfl today
//   pnpm exec tsx scripts/probe-scoreboard.ts mlb week
//
// Useful for:
//   1. Verifying provider Zod schemas still pass against today's
//      upstream payload (catch schema breaks before they hit a real
//      sync run).
//   2. Sanity-checking the normalize step — score columns populated,
//      broadcasts list non-empty for nationally televised games, etc.
//   3. Off-day debugging — when no games are scheduled, we still want
//      to confirm the providers return a valid empty payload instead
//      of erroring.
//
// This script is intentionally NOT in src/ so Next.js doesn't try to
// bundle it. It imports from src/lib/sports/data/ via the same path
// alias the runtime uses.

import { getGames, type League, type Window } from "../src/lib/sports/data/games";

const LEAGUES: readonly League[] = ["nfl", "nba", "mlb", "nhl"] as const;
const WINDOWS: readonly Window[] = ["live", "today", "week"] as const;

async function main() {
  const [leagueArg, windowArg = "today"] = process.argv.slice(2);
  if (!leagueArg || !LEAGUES.includes(leagueArg as League)) {
    console.error(`Usage: tsx scripts/probe-scoreboard.ts <${LEAGUES.join("|")}> [${WINDOWS.join("|")}]`);
    process.exit(1);
  }
  if (!WINDOWS.includes(windowArg as Window)) {
    console.error(`Invalid window "${windowArg}". Choose: ${WINDOWS.join(", ")}`);
    process.exit(1);
  }

  const league = leagueArg as League;
  const window = windowArg as Window;

  const startedAt = Date.now();
  const games = await getGames(league, window);
  const elapsed = Date.now() - startedAt;

  // Compact summary line for quick eyeballing.
  console.error(
    `[${league}/${window}] ${games.length} games in ${elapsed}ms`,
  );
  for (const g of games) {
    const score = g.awayScore != null ? ` ${g.awayScore}-${g.homeScore}` : "";
    const status = g.status === "LIVE" ? `[LIVE ${g.period ?? ""} ${g.clock ?? ""}]` : `[${g.status}]`;
    const networks = g.broadcasts.map((b) => b.network).join(", ") || "—";
    console.error(
      `  ${g.gameTime.toISOString()}  ${g.awayTeam} @ ${g.homeTeam}${score}  ${status}  TV: ${networks}`,
    );
  }

  // Full structured output to stdout for piping to jq.
  console.log(JSON.stringify(games, null, 2));
}

main().catch((err) => {
  console.error("probe-scoreboard failed:", err);
  process.exit(1);
});
