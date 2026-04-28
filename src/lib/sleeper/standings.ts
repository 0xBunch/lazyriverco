import { getLeagueOverview, isSleeperEnabled, SleeperError, type StandingsRow } from "@/lib/sleeper";

/// Full MLF standings — every roster, ranked. Used by the /sports
/// landing's right-rail standings card. Calls the same Sleeper-backed
/// overview that /sports/mlf renders, no slicing.
///
/// Returns null when Sleeper is disabled or unreachable; the caller
/// renders a placeholder. Never throws.
export async function getMlfStandings(): Promise<{
  rows: StandingsRow[];
  season: string;
  currentWeek: number;
  mode: "live" | "recap";
} | null> {
  if (!isSleeperEnabled()) return null;
  try {
    const overview = await getLeagueOverview();
    return {
      rows: overview.standings,
      season: overview.season,
      currentWeek: overview.currentWeek,
      mode: overview.mode,
    };
  } catch (err) {
    if (!(err instanceof SleeperError)) {
      console.error("[getMlfStandings] unexpected error:", err);
    }
    return null;
  }
}
