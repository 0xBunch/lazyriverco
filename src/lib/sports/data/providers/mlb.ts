// Plain HTTP fetcher + Zod validator — see espn.ts for the same
// rationale on omitting `import "server-only"`.
import { z } from "zod";
import type { League, Window } from "../types";

// MLB official statsapi (`statsapi.mlb.com`). Officially unsupported
// but stable for years; the canonical free source for in-depth MLB
// game data. Verified 2026-04-29 — `?hydrate=broadcasts` returns
// per-game `broadcasts[]` with name, type (TV/AM/FM), `isNational`,
// `callSign`, `mvpdAuthRequired`, `availableForStreaming`, in-market
// vs out-of-market, video resolution. Best public broadcast data of
// any source tested for MLB — strictly richer than ESPN's MLB feed.
//
// Used only for league === "mlb". NFL/NBA/NHL go through ESPN.

const UA =
  "Mozilla/5.0 (compatible; LazyRiverBot/1.0; +https://lazyriver.co)";
const FETCH_TIMEOUT_MS = 10_000;

const MlbTeamSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    abbreviation: z.string().optional(),
    teamCode: z.string().optional(),
    fileCode: z.string().optional(),
  })
  .passthrough();

const MlbSideSchema = z
  .object({
    team: MlbTeamSchema,
    score: z.number().optional(),
    leagueRecord: z
      .object({ wins: z.number(), losses: z.number() })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();

const MlbStatusSchema = z
  .object({
    abstractGameState: z.string(), // "Preview" / "Live" / "Final"
    detailedState: z.string(), // "Scheduled" / "In Progress" / "Final" / "Postponed" / etc.
    statusCode: z.string().optional(),
  })
  .passthrough();

const MlbLinescoreSchema = z
  .object({
    currentInning: z.number().optional(),
    currentInningOrdinal: z.string().optional(), // "Top 7th"
    inningHalf: z.string().optional(), // "Top" / "Bottom"
    inningState: z.string().optional(),
  })
  .passthrough();

const MlbBroadcastSchema = z
  .object({
    type: z.string(), // "TV" / "AM" / "FM" / etc.
    name: z.string(),
    isNational: z.boolean().optional(),
    homeAway: z.string().optional(), // "home" / "away" / "national"
    callSign: z.string().optional(),
    mvpdAuthRequired: z.boolean().optional(),
    availableForStreaming: z.boolean().optional(),
  })
  .passthrough();

const MlbGameSchema = z
  .object({
    gamePk: z.number(),
    gameDate: z.string(), // ISO 8601
    teams: z.object({
      away: MlbSideSchema,
      home: MlbSideSchema,
    }),
    status: MlbStatusSchema,
    linescore: MlbLinescoreSchema.optional(),
    broadcasts: z.array(MlbBroadcastSchema).optional(),
    season: z.union([z.string(), z.number()]).optional(),
    seriesDescription: z.string().optional(), // "Regular Season" / "Postseason" / "Spring Training"
  })
  .passthrough();

const MlbDateBlockSchema = z
  .object({
    date: z.string(), // YYYY-MM-DD
    games: z.array(MlbGameSchema),
  })
  .passthrough();

const MlbScheduleSchema = z
  .object({
    dates: z.array(MlbDateBlockSchema),
  })
  .passthrough();

export type MlbSchedule = z.infer<typeof MlbScheduleSchema>;
export type MlbGame = z.infer<typeof MlbGameSchema>;

/// Fetch MLB schedule with broadcasts hydrated. The `hydrate=broadcasts`
/// param is what makes this endpoint richer than ESPN for MLB.
///
/// Throws on network error, non-2xx, or schema mismatch. Caller is
/// responsible for retry (Trigger.dev task-level config).
export async function fetchMlbSchedule(
  league: League,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<MlbSchedule> {
  if (league !== "mlb") {
    throw new Error(`fetchMlbSchedule called with non-mlb league: ${league}`);
  }
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  // `team` hydrate is required to get team.abbreviation in the
  // response — the default schedule shape only returns id + name.
  url.searchParams.set("hydrate", "broadcasts(all),linescore,team");
  if (opts.startDate) url.searchParams.set("startDate", opts.startDate);
  if (opts.endDate) url.searchParams.set("endDate", opts.endDate);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "user-agent": UA, accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`mlb statsapi ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return MlbScheduleSchema.parse(json);
  } finally {
    clearTimeout(timer);
  }
}

/// Translate window → start/end date params.
export function mlbDatesForWindow(
  window: Window,
  now: Date = new Date(),
): { startDate?: string; endDate?: string } {
  if (window === "week") {
    return {
      startDate: ymd(now),
      endDate: ymd(addDays(now, 7)),
    };
  }
  // "live" and "today" — same day. MLB's schedule endpoint without
  // dates returns today's slate by default, but being explicit keeps
  // the response stable.
  const today = ymd(now);
  return { startDate: today, endDate: today };
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export { MlbScheduleSchema, MlbGameSchema };
