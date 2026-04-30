import { schedules, queue, logger } from "@trigger.dev/sdk";
import { syncGames, type SyncSummary } from "@/lib/sports/data/games-sync";
import { LEAGUES, type League, type Window } from "@/lib/sports/data/types";

// Trigger.dev v4 scheduled tasks for the sports games domain. Three
// schedules, fanned out across the 4 leagues internally:
//
//   sync-live-games   */5  * * * *   live in-progress games
//   sync-today-games  */15 * * * *   today's slate (incl. live)
//   sync-week-games   0    */6 * * *  next 7 days
//
// Architecture (per the 2026-04-29 plan-time architecture review):
//   1. Internal per-league fan-out keeps us within free-tier's
//      10-schedule cap (3 sports schedules + 1 feeds = 4 total).
//   2. Handler logic lives in src/lib/sports/data/games-sync.ts as a
//      pure-function `syncGames(league, window)` — these tasks are
//      thin shells. SDK lock-in stays minimal: only the wrappers
//      below would need rewriting if we left Trigger.dev.
//   3. Per-task retry config (not in the handler).
//   4. Master kill switch SPORTS_SYNC_ENABLED + per-domain
//      SPORTS_GAMES_SYNC_ENABLED. Master OFF short-circuits all
//      domain flags so a 2am incident is one env-var flip, not a
//      code revert.
//   5. Concurrency: every schedule uses a queue with
//      concurrencyLimit=1 to prevent overlap if a run exceeds its
//      cron interval. Cheap insurance — even the 6-hour `sync-week`
//      schedule gets one (kieran 2026-04-30 review: avoids a race
//      in the heuristic merge if a slow run overlaps with the next).
//      Per-task config passes only `{ name }` (not the full Queue
//      object) so the concurrencyLimit is declared in exactly one
//      place — kieran's blocker #2.

const liveQueue = queue({ name: "sports-sync-live", concurrencyLimit: 1 });
const todayQueue = queue({ name: "sports-sync-today", concurrencyLimit: 1 });
const weekQueue = queue({ name: "sports-sync-week", concurrencyLimit: 1 });

type Totals = {
  fetched: number;
  inserted: number;
  updated: number;
  merged: number;
  skipped: number;
};

type FanoutResult = {
  window: Window;
  perLeague: SyncSummary[];
  /// Aggregate counts across all leagues. inserted/updated/merged are
  /// orthogonal — `total writes = inserted + updated + merged`.
  totals: Totals;
  /// When fan-out was short-circuited by a kill switch, why.
  /// Undefined for normal completed runs.
  skippedReason?: "master_off" | "domain_off";
  elapsedMs: number;
};

async function fanoutAcrossLeagues(window: Window): Promise<FanoutResult> {
  const startedAt = Date.now();

  // Master kill switch + per-domain flag. Master OFF takes precedence;
  // both must be ON for syncs to actually run.
  if (process.env.SPORTS_SYNC_ENABLED !== "true") {
    logger.info("sports-sync skipped: SPORTS_SYNC_ENABLED master flag off");
    return emptyResult(window, "master_off", startedAt);
  }
  if (process.env.SPORTS_GAMES_SYNC_ENABLED !== "true") {
    logger.info(
      "sports-sync skipped: SPORTS_GAMES_SYNC_ENABLED domain flag off",
    );
    return emptyResult(window, "domain_off", startedAt);
  }
  // Both flags ON → run.

  // Per-league fan-out. Promise.all so a slow upstream on one league
  // doesn't block the others; per-league errors don't poison the
  // batch (syncGames itself catches per-game errors and returns a
  // partial summary).
  const perLeague = await Promise.all(
    LEAGUES.map(async (league: League) => {
      try {
        return await syncGames(league, window);
      } catch (err) {
        logger.error(`sports-sync ${league}/${window} failed`, {
          err: err instanceof Error ? err.message : String(err),
        });
        // Return an empty summary for the failing league rather than
        // re-throwing — Trigger.dev's task-level retry covers full
        // task failure; per-league flakes are absorbed by the
        // aggregate.
        return {
          league,
          window,
          fetched: 0,
          inserted: 0,
          updated: 0,
          merged: 0,
          skipped: 0,
          elapsedMs: 0,
        } satisfies SyncSummary;
      }
    }),
  );

  const totals = perLeague.reduce<Totals>(
    (acc, s) => ({
      fetched: acc.fetched + s.fetched,
      inserted: acc.inserted + s.inserted,
      updated: acc.updated + s.updated,
      merged: acc.merged + s.merged,
      skipped: acc.skipped + s.skipped,
    }),
    { fetched: 0, inserted: 0, updated: 0, merged: 0, skipped: 0 },
  );

  const result: FanoutResult = {
    window,
    perLeague,
    totals,
    elapsedMs: Date.now() - startedAt,
  };
  logger.info("sports-sync complete", { window, ...totals });
  return result;
}

function emptyResult(
  window: Window,
  reason: "master_off" | "domain_off",
  startedAt: number,
): FanoutResult {
  return {
    window,
    perLeague: [],
    totals: { fetched: 0, inserted: 0, updated: 0, merged: 0, skipped: 0 },
    skippedReason: reason,
    elapsedMs: Date.now() - startedAt,
  };
}

// --- Tasks ---

export const syncLiveGames = schedules.task({
  id: "sync-live-games",
  cron: "*/5 * * * *",
  queue: { name: liveQueue.name },
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 30_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
  },
  // 4 minutes — must stay under the 5-min cron interval so a stuck
  // run gets cancelled before the next one would fire (concurrency
  // limit handles the overlap, but maxDuration is the second line of
  // defense for genuinely wedged runs).
  maxDuration: 4 * 60,
  run: async () => fanoutAcrossLeagues("live"),
});

export const syncTodayGames = schedules.task({
  id: "sync-today-games",
  cron: "*/15 * * * *",
  queue: { name: todayQueue.name },
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 60_000,
    maxTimeoutInMs: 120_000,
    factor: 2,
  },
  maxDuration: 10 * 60,
  run: async () => fanoutAcrossLeagues("today"),
});

export const syncWeekGames = schedules.task({
  id: "sync-week-games",
  cron: "0 */6 * * *", // every 6 hours
  queue: { name: weekQueue.name },
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 60_000,
    maxTimeoutInMs: 300_000,
    factor: 2,
  },
  maxDuration: 10 * 60,
  run: async () => fanoutAcrossLeagues("week"),
});
