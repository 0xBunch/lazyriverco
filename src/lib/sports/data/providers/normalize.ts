import type { Broadcast, Game, GameStatus, League } from "../types";
import type { EspnEvent } from "./espn";
import type { MlbGame } from "./mlb";

// Per-source → normalized Game converters. Kept in their own file
// (not on the provider modules) so the provider modules stay focused
// on fetch + Zod validation, and so a future provider swap (e.g.
// switching MLB from statsapi to ESPN as the source-of-truth) is a
// one-file change.
//
// Both functions are pure: same input → same output, no Date.now()
// reads, no side effects. The Game's `syncedAt` is supplied by the
// caller so a single sync run stamps a consistent timestamp across
// every game in the batch.

export function normalizeEspn(
  event: EspnEvent,
  league: League,
  syncedAt: Date,
): Game {
  const competition = event.competitions[0];
  const away = competition.competitors.find((c) => c.homeAway === "away");
  const home = competition.competitors.find((c) => c.homeAway === "home");
  if (!away || !home) {
    throw new Error(`espn event ${event.id} missing competitor (away/home)`);
  }

  const status = mapEspnStatus(competition.status?.type.name ?? event.status.type.name);
  const period = competition.status?.type.detail ?? event.status.type.detail;
  const clock = competition.status?.displayClock ?? event.status.displayClock;
  const seasonType = mapEspnSeasonType(event.season?.type);

  // Score: ESPN sends as string in many leagues, number in some.
  const awayScore = parseScore(away.score);
  const homeScore = parseScore(home.score);

  // Broadcasts: prefer geoBroadcasts (richer), fall back to flat broadcasts.
  const broadcasts: Broadcast[] = [];
  for (const gb of competition.geoBroadcasts ?? []) {
    const network = gb.media?.shortName;
    if (!network) continue;
    const type = mapEspnBroadcastType(gb.type?.shortName);
    const market = mapEspnMarket(gb.market?.type);
    broadcasts.push({
      type,
      network,
      isNational: market === "national",
      market,
    });
  }
  if (broadcasts.length === 0) {
    for (const fb of competition.broadcasts ?? []) {
      const names = fb.names ?? [];
      const market = fb.market === "national" ? "national" : undefined;
      for (const network of names) {
        broadcasts.push({ type: "TV", network, isNational: market === "national", market });
      }
    }
  }

  return {
    league,
    externalId: event.id,
    awayTeam: away.team.abbreviation,
    homeTeam: home.team.abbreviation,
    awayTeamFull: away.team.displayName ?? away.team.shortDisplayName,
    homeTeamFull: home.team.displayName ?? home.team.shortDisplayName,
    awayLogoUrl: away.team.logo,
    homeLogoUrl: home.team.logo,
    gameTime: new Date(event.date),
    status,
    awayScore,
    homeScore,
    period: status === "SCHEDULED" ? undefined : period,
    clock: status === "LIVE" ? clock : undefined,
    broadcasts,
    season: event.season?.year,
    seasonType,
    week: event.week?.number,
    syncedAt,
  };
}

export function normalizeMlb(game: MlbGame, syncedAt: Date): Game {
  const status = mapMlbStatus(game.status.detailedState);
  const period = game.linescore?.currentInningOrdinal;
  // MLB doesn't return a clock; "Top 7th" / "Bottom 4th" is the
  // closest analogue. Always store as period; clock stays undefined.

  const broadcasts: Broadcast[] = (game.broadcasts ?? []).map((b) => ({
    type: mapMlbBroadcastType(b.type),
    network: b.name,
    isNational: !!b.isNational,
    market: mapMlbMarket(b.homeAway, b.isNational),
    authRequired: b.mvpdAuthRequired,
  }));

  const seasonNum =
    typeof game.season === "string" ? Number(game.season) : game.season;
  const seasonType = mapMlbSeasonType(game.seriesDescription);

  return {
    league: "mlb",
    externalId: String(game.gamePk),
    awayTeam:
      game.teams.away.team.abbreviation ??
      game.teams.away.team.fileCode?.toUpperCase() ??
      game.teams.away.team.name,
    homeTeam:
      game.teams.home.team.abbreviation ??
      game.teams.home.team.fileCode?.toUpperCase() ??
      game.teams.home.team.name,
    awayTeamFull: game.teams.away.team.name,
    homeTeamFull: game.teams.home.team.name,
    gameTime: new Date(game.gameDate),
    status,
    awayScore: game.teams.away.score,
    homeScore: game.teams.home.score,
    period: status === "SCHEDULED" ? undefined : period,
    clock: undefined,
    broadcasts,
    season: Number.isFinite(seasonNum) ? seasonNum : undefined,
    seasonType,
    week: undefined, // MLB has no week concept
    syncedAt,
  };
}

// --- Status mappers ---

function mapEspnStatus(name: string | undefined): GameStatus {
  switch (name) {
    case "STATUS_SCHEDULED":
      return "SCHEDULED";
    case "STATUS_IN_PROGRESS":
    case "STATUS_HALFTIME":
    case "STATUS_END_PERIOD":
    case "STATUS_DELAYED":
      return "LIVE";
    case "STATUS_FINAL":
    case "STATUS_FULL_TIME":
    case "STATUS_FINAL_SHOOTOUT":
    case "STATUS_FINAL_OVERTIME":
      return "FINAL";
    case "STATUS_POSTPONED":
    case "STATUS_CANCELED":
    case "STATUS_RAIN_DELAY":
      return "POSTPONED";
    default:
      // Unknown — treat as SCHEDULED so we don't accidentally render
      // a stale FINAL. The provider modules' Zod validation lets
      // unknown states through (passthrough), so this default
      // protects the read path.
      return "SCHEDULED";
  }
}

function mapMlbStatus(detailedState: string): GameStatus {
  const s = detailedState.toLowerCase();
  if (s === "scheduled" || s === "warmup" || s === "pre-game") return "SCHEDULED";
  if (s === "final" || s === "completed early" || s === "game over") return "FINAL";
  if (s === "postponed" || s === "cancelled" || s === "suspended") return "POSTPONED";
  // "In Progress", "Manager Challenge", "Delayed: ...", etc.
  return "LIVE";
}

// --- Season mappers ---

function mapEspnSeasonType(t: number | undefined): "REG" | "POST" | "PRE" | undefined {
  switch (t) {
    case 1:
      return "PRE";
    case 2:
      return "REG";
    case 3:
      return "POST";
    default:
      return undefined;
  }
}

function mapMlbSeasonType(
  seriesDescription: string | undefined,
): "REG" | "POST" | "PRE" | undefined {
  if (!seriesDescription) return undefined;
  const s = seriesDescription.toLowerCase();
  if (s.includes("regular")) return "REG";
  if (s.includes("post") || s.includes("world series") || s.includes("playoff")) return "POST";
  if (s.includes("spring") || s.includes("exhibition")) return "PRE";
  return undefined;
}

// --- Broadcast mappers ---

function mapEspnBroadcastType(short: string | undefined): "TV" | "STREAMING" | "RADIO" {
  if (!short) return "TV";
  const s = short.toLowerCase();
  if (s.includes("stream") || s.includes("ott")) return "STREAMING";
  if (s.includes("radio")) return "RADIO";
  return "TV";
}

function mapEspnMarket(t: string | undefined): "national" | "away" | "home" | undefined {
  if (!t) return undefined;
  const s = t.toLowerCase();
  if (s.includes("national")) return "national";
  if (s.includes("away")) return "away";
  if (s.includes("home")) return "home";
  return undefined;
}

function mapMlbBroadcastType(t: string): "TV" | "STREAMING" | "RADIO" {
  const s = t.toUpperCase();
  if (s === "TV") return "TV";
  if (s === "AM" || s === "FM") return "RADIO";
  // MLB also uses "Internet" / "Web" / "Stream" markers in some rows.
  if (s.includes("STREAM") || s.includes("WEB") || s.includes("INTERNET")) return "STREAMING";
  return "TV";
}

function mapMlbMarket(
  homeAway: string | undefined,
  isNational: boolean | undefined,
): "national" | "away" | "home" | undefined {
  if (isNational) return "national";
  if (homeAway === "home") return "home";
  if (homeAway === "away") return "away";
  if (homeAway === "national") return "national";
  return undefined;
}

function parseScore(s: string | number | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = typeof s === "number" ? s : Number(s);
  return Number.isFinite(n) ? n : undefined;
}
