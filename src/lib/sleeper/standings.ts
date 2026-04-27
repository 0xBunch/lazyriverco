import { getLeagueOverview, isSleeperEnabled, SleeperError, type StandingsRow } from "@/lib/sleeper";

/// Top N MLF managers by current rank. Used by the /sports landing's
/// MLF Top 3 strip — calls the same Sleeper-backed overview that
/// /sports/mlf renders, then slices.
///
/// Returns null when Sleeper is disabled or unreachable; the caller
/// renders a placeholder. Never throws.
export async function getMlfTopN(n: number = 3): Promise<{
  rows: StandingsRow[];
  season: string;
  currentWeek: number;
  mode: "live" | "recap";
} | null> {
  if (!isSleeperEnabled()) return null;
  try {
    const overview = await getLeagueOverview();
    return {
      rows: overview.standings.slice(0, n),
      season: overview.season,
      currentWeek: overview.currentWeek,
      mode: overview.mode,
    };
  } catch (err) {
    // Misconfigured (missing env), network failure, or upstream Sleeper
    // outage. Either way we fail closed to a placeholder rather than
    // 500ing the whole landing page. Log the unexpected case so an
    // invisible-failure mode (e.g. a Prisma error inside getLeagueOverview)
    // doesn't get silently swallowed in production.
    if (!(err instanceof SleeperError)) {
      console.error("[getMlfTopN] unexpected error:", err);
    }
    return null;
  }
}
