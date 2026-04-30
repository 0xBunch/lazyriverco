import "server-only";
import type { Prisma, SportTag } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getGames } from "./games";
import type { Broadcast, Game, League, Window } from "./types";

// Stable mapping from the lowercase League type to the SportTag enum.
// Reaching for `game.league.toUpperCase() as SportTag` was fragile —
// adding a non-uppercase-mappable league later (e.g., "epl") would
// silently produce an invalid sport tag at runtime.
const SPORT_TAG: Record<League, SportTag> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
};

// Postgres writer for the games domain. Calls getGames() (the read
// side in games.ts) and upserts each Game into SportsScheduleGame.
//
// Architecture decision (2026-04-30): the architect-strategist's
// 2026-04-29 review asked for read + write co-located per domain,
// but games.ts intentionally stays free of `import "server-only"`
// so scripts/probe-scoreboard.ts can validate the providers' Zod
// schemas live from tsx. Splitting the write side into a sibling
// `games-sync.ts` preserves the per-domain locality (same naming
// family, same folder, one import for callers) while letting the
// read side stay tsx-importable. Future domains follow the same
// pattern: `standings.ts` (read) + `standings-sync.ts` (write), etc.
//
// Heuristic merge: an admin-entered SportsScheduleGame row carries a
// NULL externalId. When the upstream sync first encounters that game,
// instead of inserting a new row (which would duplicate the manual
// entry), we look for a matching manual row by (sport, awayTeam,
// homeTeam, gameTime ± MERGE_WINDOW_MS) and stamp the externalId on
// that row. After the first match, subsequent syncs are plain
// upserts on (sport, externalId).
//
// Per-game transactions: each game's upsert + merge runs in its own
// transaction so a single bad payload doesn't poison the whole batch.
// Trigger.dev's task-level retry handles transient DB errors.

const MERGE_WINDOW_MS = 2 * 60 * 60 * 1000; // ±2h

export type SyncSummary = {
  league: League;
  window: Window;
  /// Number of games returned by the upstream provider for this window.
  fetched: number;
  /// Net rows touched. Equals inserted + updated + merged. Per kieran
  /// 2026-04-30 review: keep these orthogonal so dashboards don't
  /// double-count merged within upserted.
  inserted: number;
  updated: number;
  /// Pre-existing admin-entered rows that got their externalId stamped
  /// on this run (i.e., heuristic merge succeeded — the manual row
  /// "joined" the synced data). Disjoint from `inserted` and
  /// `updated`.
  merged: number;
  /// Games skipped due to per-game errors (validation, DB constraint,
  /// etc.). Surfaced separately so the task summary can spot a partial
  /// failure that would otherwise look successful.
  skipped: number;
  elapsedMs: number;
};

export async function syncGames(
  league: League,
  window: Window,
  opts: { now?: Date } = {},
): Promise<SyncSummary> {
  const startedAt = Date.now();
  const now = opts.now ?? new Date();
  const games = await getGames(league, window, now);

  let inserted = 0;
  let updated = 0;
  let merged = 0;
  let skipped = 0;

  for (const game of games) {
    try {
      const result = await upsertGame(game);
      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else merged++;
    } catch (err) {
      console.error(
        `[sports/games-sync] failed to upsert ${game.league}:${game.externalId}`,
        err,
      );
      skipped++;
    }
  }

  return {
    league,
    window,
    fetched: games.length,
    inserted,
    updated,
    merged,
    skipped,
    elapsedMs: Date.now() - startedAt,
  };
}

type UpsertResult = "inserted" | "updated" | "merged";

async function upsertGame(game: Game): Promise<UpsertResult> {
  const sportTag = SPORT_TAG[game.league];
  const primary = pickPrimaryBroadcast(game.broadcasts);
  const writableFields = {
    sport: sportTag,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    awayLogoUrl: game.awayLogoUrl ?? null,
    homeLogoUrl: game.homeLogoUrl ?? null,
    gameTime: game.gameTime,
    network: primary?.network ?? null,
    watchUrl: primary?.watchUrl ?? null,
    status: game.status,
    awayScore: game.awayScore ?? null,
    homeScore: game.homeScore ?? null,
    period: game.period ?? null,
    clock: game.clock ?? null,
    syncedAt: game.syncedAt,
    season: game.season ?? null,
    seasonType: game.seasonType ?? null,
    week: game.week ?? null,
  };

  return prisma.$transaction(async (tx) => {
    // Path A: upsert by canonical (sport, externalId). Fast path for
    // games we've seen before.
    const existingByExternal = await tx.sportsScheduleGame.findUnique({
      where: { sport_externalId: { sport: sportTag, externalId: game.externalId } },
      select: { id: true },
    });
    if (existingByExternal) {
      await tx.sportsScheduleGame.update({
        where: { id: existingByExternal.id },
        data: writableFields,
      });
      return "updated";
    }

    // Path B: heuristic merge — find an admin-entered row (NULL
    // externalId) that matches teams + game window, and stamp the
    // externalId onto it.
    const merged = await findManualMatch(tx, sportTag, game);
    if (merged) {
      await tx.sportsScheduleGame.update({
        where: { id: merged.id },
        data: { ...writableFields, externalId: game.externalId },
      });
      return "merged";
    }

    // Path C: insert new.
    await tx.sportsScheduleGame.create({
      data: { ...writableFields, externalId: game.externalId },
    });
    return "inserted";
  });
}

async function findManualMatch(
  tx: Prisma.TransactionClient,
  sport: SportTag,
  game: Game,
): Promise<{ id: string } | null> {
  const lo = new Date(game.gameTime.getTime() - MERGE_WINDOW_MS);
  const hi = new Date(game.gameTime.getTime() + MERGE_WINDOW_MS);

  // Use the [sport, awayTeam, homeTeam, gameTime] index — Prisma
  // automatically picks it for this query shape. We require team
  // abbreviations to match exactly; if the manual entry used full
  // names (or different abbrs), no merge happens and we insert
  // alongside. Acceptable: KB can hide the manual row from /admin.
  return tx.sportsScheduleGame.findFirst({
    where: {
      sport,
      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      externalId: null,
      gameTime: { gte: lo, lte: hi },
    },
    select: { id: true },
  });
}

/// Pick the broadcast we want to surface as the row's `network` /
/// `watchUrl`. National broadcasts win first; otherwise the first TV
/// broadcast; otherwise the first entry of any kind. Returns
/// undefined if the broadcast list is empty (uncommon — most synced
/// games have at least one entry).
function pickPrimaryBroadcast(list: Broadcast[]): Broadcast | undefined {
  if (list.length === 0) return undefined;
  const national = list.find((b) => b.isNational && b.type === "TV");
  if (national) return national;
  const tv = list.find((b) => b.type === "TV");
  if (tv) return tv;
  return list[0];
}
