// Normalized types for the sports data layer. Consumers (server
// components, the future pick'em UI) read these — never raw provider
// payloads. Per the 2026-04-29 plan + architect review:
//   - "normalized + escape hatch" was offered but KB picked plain
//     normalized. The cost is per-source richness gets flattened
//     (e.g., MLB's in-market vs out-of-market broadcast split is lost
//     when collapsed to a single `network` string). Acceptable for v1
//     since TonightStrip + sub-pages only render the primary national
//     broadcast anyway.
//   - Per-domain wrappers split read/write inside the same file
//     (games.ts has both getGames + syncGames). When standings ship
//     (D4), it gets its own standings.ts the same way.
//
// Future-proofing notes:
//   - `season` / `seasonType` / `week` are populated when the upstream
//     provides them (NFL season + week are reliable; MLB has no week
//     concept and sets week=null). The future pick'em surface queries
//     `where: { league, season, week }`.
//   - `Broadcast` keeps separate from the SportsScheduleGame schema's
//     flat `network` + `watchUrl` columns — at write time we pick the
//     primary broadcast and store its (network, watchUrl) on the row.
//     Future "show all broadcast options" UI can re-fetch the full
//     list from upstream if needed.

export type League = "nfl" | "nba" | "mlb" | "nhl";

export const LEAGUES: readonly League[] = ["nfl", "nba", "mlb", "nhl"] as const;

/// Status mirrors prisma's ScheduleStatus enum. SCHEDULED → LIVE →
/// FINAL is the happy path; POSTPONED is the rare exception.
export type GameStatus = "SCHEDULED" | "LIVE" | "FINAL" | "POSTPONED";

/// Normalized broadcast entry. ESPN's `geoBroadcasts[]` and MLB's
/// `broadcasts[]` both fold into this shape.
export type Broadcast = {
  /// "TV" / "STREAMING" / "RADIO". Lowercase keeps things friendly to
  /// JSON consumers; the provider modules normalize from upstream's
  /// uppercase variants.
  type: "TV" | "STREAMING" | "RADIO";
  /// Display name — "NBC", "Peacock", "MLB.TV", "ESPN+". Whatever the
  /// upstream put in the broadcaster's `media` / `name` field.
  network: string;
  /// True when this broadcast is national. National broadcasts sort
  /// first when picking the primary for TonightStrip's network pill.
  isNational: boolean;
  /// "national" / "away" / "home" / undefined. MLB's split between
  /// in-market and out-of-market lands here.
  market?: "national" | "away" | "home";
  /// MLB-specific: provider says the stream requires MVPD (cable
  /// login) auth. Other providers leave this undefined.
  authRequired?: boolean;
  /// Optional deep-link to the streaming destination.
  /// Currently rarely populated (most upstreams give a network name
  /// only); we let the renderer build a default URL like
  /// peacocktv.com when watchUrl is null.
  watchUrl?: string;
};

/// Normalized scheduled / in-progress / completed game. The provider
/// wrappers (espn.ts, mlb.ts) emit this shape; the rest of the app
/// reads it.
export type Game = {
  league: League;
  /// Upstream identifier. ESPN: event ID like "401547439". MLB: gamePk
  /// like 745812. Used as the (sport, externalId) unique key when we
  /// upsert into SportsScheduleGame.
  externalId: string;
  /// Team abbreviations (e.g. "PHI", "DAL"). The visual layer renders
  /// these directly today; full team names + logos come from the same
  /// upstream and are kept here for future surfaces.
  awayTeam: string;
  homeTeam: string;
  awayTeamFull?: string;
  homeTeamFull?: string;
  awayLogoUrl?: string;
  homeLogoUrl?: string;
  /// Kickoff / first pitch / puck drop. Always UTC.
  gameTime: Date;
  status: GameStatus;
  awayScore?: number;
  homeScore?: number;
  /// Period label as the upstream formats it: "Q3" (NFL), "Top 7"
  /// (MLB), "P2" (NHL), "H2" (NBA). Free-form to preserve provider
  /// rendering; never parse this.
  period?: string;
  /// Game clock as a free-form string, e.g. "8:42". Null when status
  /// is SCHEDULED or FINAL.
  clock?: string;
  /// Full broadcast list. The sync.ts writer flattens to a primary
  /// (network, watchUrl) for the SportsScheduleGame row.
  broadcasts: Broadcast[];
  /// Season-tagging fields. Populated when the upstream provides them.
  /// NFL: `season` is the year the season starts in (2026 = Aug 2026
  /// through Feb 2027). MLB/NBA/NHL: same convention.
  season?: number;
  seasonType?: "REG" | "POST" | "PRE";
  /// Week number for NFL/CFB regular season. Null for daily-schedule
  /// sports (MLB/NBA/NHL).
  week?: number;
  /// When this Game was last fetched from upstream. The sync writer
  /// stamps this on the SportsScheduleGame row's `syncedAt`.
  syncedAt: Date;
};

/// Window selector for getGames + sync calls. Mirrors the cron schedule
/// names in PR 2:
///   - "live"  — currently in-progress, fast cadence (5 min)
///   - "today" — anything with gameTime in [now-6h, now+18h]
///   - "week"  — next 7 days from now
///
/// The provider implementations decide how to translate these to
/// upstream date params. ESPN's scoreboard endpoint takes a `dates`
/// param (YYYYMMDD) and we expand the window to multiple calls.
export type Window = "live" | "today" | "week";
