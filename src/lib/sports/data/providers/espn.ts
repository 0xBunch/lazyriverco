// Plain HTTP fetcher + Zod validator — no Prisma, no env secrets, no
// fs. Intentionally importable from tsx (probe-scoreboard.ts) so we
// can validate the schema against live upstream payloads outside the
// Next.js bundle. The orchestrator above (games.ts) holds the
// runtime-context guard.
import { z } from "zod";
import type { Game, League, Window } from "../types";

// ESPN hidden / undocumented public API. Powers NFL, NBA, NHL (and
// also MLB, NCAAF, NCAAB, MLS, EPL — out of scope for v1). Verified
// 2026-04-29 against:
//   site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
// returned a Super Bowl LX event with `geoBroadcasts: [NBC, Peacock]`
// + a `broadcast: "NBC/Peacock"` summary string.
//
// Risk: schema can shift mid-season without notice (no SLA, no docs).
// Mitigations:
//   1. The Zod schemas below validate ONLY the fields we actually
//      consume — extra fields are passthrough so unrelated upstream
//      changes don't break us.
//   2. validate() throws a descriptive error so a schema break shows
//      up immediately in Trigger.dev's run log instead of silently
//      shipping nonsense to the DB.
//   3. We only commit a sync write to the DB when validation passes,
//      so a partial schema break never produces partial Game rows.
//
// UA string mirrors the feed-poller's pattern (per lesson 2026-04-27:
// some CDNs return 0-byte body for fetches that don't look browser-
// shaped). Identifies as LazyRiverBot under the standard browser-
// compatibility framing.
const UA =
  "Mozilla/5.0 (compatible; LazyRiverBot/1.0; +https://lazyriver.co)";
const FETCH_TIMEOUT_MS = 10_000;

const LEAGUE_PATH: Record<League, string> = {
  nfl: "football/nfl",
  nba: "basketball/nba",
  // mlb routes through MLB's official statsapi (richer broadcasts).
  // ESPN's MLB scoreboard works too if we ever fall back.
  mlb: "baseball/mlb",
  nhl: "hockey/nhl",
};

// ESPN broadcast row. We see two shapes in practice:
//   - `geoBroadcasts[]` (newer) with structured type/media
//   - `broadcasts[]` (older) with flat names
// We accept both and normalize at the call site.
const EspnGeoBroadcastSchema = z
  .object({
    type: z.object({ shortName: z.string() }).optional(),
    market: z.object({ type: z.string() }).optional(),
    media: z.object({ shortName: z.string() }).optional(),
  })
  .passthrough();

const EspnFlatBroadcastSchema = z
  .object({
    market: z.string().optional(),
    names: z.array(z.string()).optional(),
  })
  .passthrough();

const EspnTeamSchema = z
  .object({
    abbreviation: z.string(),
    displayName: z.string().optional(),
    shortDisplayName: z.string().optional(),
    logo: z.string().url().optional(),
  })
  .passthrough();

const EspnCompetitorSchema = z
  .object({
    homeAway: z.enum(["home", "away"]),
    score: z.union([z.string(), z.number()]).optional(),
    team: EspnTeamSchema,
  })
  .passthrough();

const EspnStatusTypeSchema = z
  .object({
    name: z.string(), // e.g. "STATUS_SCHEDULED" / "STATUS_IN_PROGRESS" / "STATUS_FINAL" / "STATUS_POSTPONED"
    state: z.string().optional(), // "pre" / "in" / "post"
    completed: z.boolean().optional(),
    description: z.string().optional(),
    detail: z.string().optional(), // "Final" / "1st Quarter" / "Top 3rd"
    shortDetail: z.string().optional(),
  })
  .passthrough();

const EspnStatusSchema = z
  .object({
    type: EspnStatusTypeSchema,
    period: z.number().optional(),
    displayClock: z.string().optional(),
  })
  .passthrough();

const EspnCompetitionSchema = z
  .object({
    competitors: z.array(EspnCompetitorSchema),
    status: EspnStatusSchema.optional(),
    broadcasts: z.array(EspnFlatBroadcastSchema).optional(),
    geoBroadcasts: z.array(EspnGeoBroadcastSchema).optional(),
  })
  .passthrough();

const EspnSeasonSchema = z
  .object({
    year: z.number(),
    type: z.number().optional(), // 1 = pre, 2 = reg, 3 = post
  })
  .passthrough();

const EspnEventSchema = z
  .object({
    id: z.string(),
    date: z.string(), // ISO 8601
    week: z.object({ number: z.number() }).optional(),
    season: EspnSeasonSchema.optional(),
    status: EspnStatusSchema,
    competitions: z.array(EspnCompetitionSchema).min(1),
  })
  .passthrough();

const EspnScoreboardSchema = z
  .object({
    events: z.array(EspnEventSchema),
    season: EspnSeasonSchema.optional(),
    week: z.object({ number: z.number() }).optional(),
  })
  .passthrough();

export type EspnScoreboard = z.infer<typeof EspnScoreboardSchema>;
export type EspnEvent = z.infer<typeof EspnEventSchema>;

/// Fetch ESPN's scoreboard endpoint and validate the shape. Throws on
/// network error, non-2xx, or schema mismatch. The caller (sync.ts in
/// PR 2) is responsible for retry policy via Trigger.dev's task-level
/// `retry` config.
export async function fetchEspnScoreboard(
  league: League,
  opts: { dates?: string } = {},
): Promise<EspnScoreboard> {
  const path = LEAGUE_PATH[league];
  const url = new URL(
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`,
  );
  if (opts.dates) url.searchParams.set("dates", opts.dates);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "user-agent": UA, accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(
        `espn ${league} scoreboard ${res.status}: ${res.statusText}`,
      );
    }
    const json = await res.json();
    return EspnScoreboardSchema.parse(json);
  } finally {
    clearTimeout(timer);
  }
}

/// Translate the {live, today, week} window selector into ESPN `dates`
/// query strings. ESPN's scoreboard endpoint without a `dates` param
/// returns the current day's slate, which covers `live` + `today`. For
/// `week` we fan out across 7 days (YYYYMMDD-YYYYMMDD range form).
export function espnDatesForWindow(window: Window, now: Date = new Date()): string | undefined {
  if (window === "week") {
    const start = formatYmd(now);
    const end = formatYmd(addDays(now, 7));
    return `${start}-${end}`;
  }
  // Both "live" and "today" map to "no dates param" — current day's
  // slate. ESPN re-issues live updates within the same response.
  return undefined;
}

function formatYmd(d: Date): string {
  // ESPN expects local-Eastern-ish dates; UTC date is close enough at
  // our cadence (sync runs every 5–15 min). Use UTC date components to
  // keep the ymd stable regardless of the running container's TZ.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/// Re-export so sync.ts + normalize.ts can use the EspnEvent type
/// without importing zod directly.
export { EspnScoreboardSchema, EspnEventSchema };

// Type-export to keep `Game` import next to its concrete consumer.
export type { Game };
