import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// MLF Rookie Draft 2026 — pure helpers + pool-seed helper.
//
// Everything except `seedRookiePool` is synchronous, pure, and trivially
// unit-testable. The snake-order function is the critical one — get the
// reversal wrong and the entire board is off for rounds 2+. Treat it as
// load-bearing: any change here needs round-2-reversal verification.
// ---------------------------------------------------------------------------

export const ROOKIE_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type RookiePosition = (typeof ROOKIE_POSITIONS)[number];

export type SnakeSlot = {
  /** 1-indexed round number. */
  round: number;
  /** 1-indexed pick position within the round. */
  pickInRound: number;
  /** 1-indexed global pick number. Stored on DraftPick.overallPick. */
  overallPick: number;
  /** 1-indexed DraftSlot.slotOrder this pick belongs to. */
  slotOrder: number;
};

/**
 * Returns the full pick sequence for a draft configuration.
 *
 * For snake drafts (default), round 1 goes 1→N, round 2 goes N→1, round 3
 * goes 1→N, and so on — odd rounds forward, even rounds reverse. For
 * non-snake (a.k.a. "linear") drafts, every round goes 1→N.
 *
 * Pure function; no I/O. Called once at draft-setup time to seed the 24
 * DraftPick rows (round × pickInRound × overallPick × slotOrder). The UI
 * reads from the stored rows — never recomputes client-side — so this is
 * the single source of truth for snake math.
 */
export function computeSnakeOrder(
  totalSlots: number,
  totalRounds: number,
  snake: boolean = true,
): SnakeSlot[] {
  if (totalSlots < 2 || totalRounds < 1) return [];
  const out: SnakeSlot[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const reverse = snake && round % 2 === 0;
    for (let i = 1; i <= totalSlots; i++) {
      const slotOrder = reverse ? totalSlots - i + 1 : i;
      out.push({
        round,
        pickInRound: i,
        overallPick: (round - 1) * totalSlots + i,
        slotOrder,
      });
    }
  }
  return out;
}

/**
 * English ordinal for 1–32 (the schema-enforced upper bound on totalSlots).
 * Used in the Goodell-box caption template: "With the {ordinal} pick in
 * the MLF Draft…". Falls back to `{n}th` for anything beyond the table so
 * we never crash even on a schema-violating config.
 */
const ORDINALS: Record<number, string> = {
  1: "first",        2: "second",       3: "third",        4: "fourth",
  5: "fifth",        6: "sixth",        7: "seventh",      8: "eighth",
  9: "ninth",        10: "tenth",       11: "eleventh",    12: "twelfth",
  13: "thirteenth",  14: "fourteenth",  15: "fifteenth",   16: "sixteenth",
  17: "seventeenth", 18: "eighteenth",  19: "nineteenth",  20: "twentieth",
  21: "twenty-first",  22: "twenty-second",  23: "twenty-third",
  24: "twenty-fourth", 25: "twenty-fifth",   26: "twenty-sixth",
  27: "twenty-seventh",28: "twenty-eighth",  29: "twenty-ninth",
  30: "thirtieth",     31: "thirty-first",   32: "thirty-second",
};

export function ordinalPick(n: number): string {
  if (!Number.isFinite(n) || n < 1) return `${n}th`;
  return ORDINALS[n] ?? `${n}th`;
}

export type CaptionInput = {
  overallPick: number;
  slotTeamName: string | null;
  slotManagerDisplay: string;
  playerFullName: string;
  playerNflTeam: string | null;
};

/**
 * Formats the Goodell-box caption from the pieces the server has on a
 * locked pick. Two branches:
 *
 *   * With a team name: "With the sixth pick in the MLF Draft, the Austin
 *     Bats select Fernando Mendoza, Las Vegas Raiders."
 *   * Without: "With the sixth pick in the MLF Draft, Maverick selects
 *     Fernando Mendoza, Las Vegas Raiders."
 *
 * The "the … select" plural reads natural when the subject is a team
 * name; drops to "Name selects" otherwise.
 */
export function formatCaption(input: CaptionInput): string {
  const ordinal = ordinalPick(input.overallPick);
  const team = input.slotTeamName?.trim();
  const manager = input.slotManagerDisplay.trim();
  const playerTeam = input.playerNflTeam?.trim();
  const playerSuffix = playerTeam ? `, ${playerTeam}` : "";
  if (team) {
    return `With the ${ordinal} pick in the MLF Draft, the ${team} select ${input.playerFullName}${playerSuffix}.`;
  }
  return `With the ${ordinal} pick in the MLF Draft, ${manager} selects ${input.playerFullName}${playerSuffix}.`;
}

/**
 * "Is this logged-in user the one currently on the clock?" — the sole
 * trigger for the manager-only on-clock UI treatment (pick button, timer
 * glow, browser-title flash). Returns false for admins viewing someone
 * else's turn (they get the spectator + live-cockpit view instead).
 */
export function isOnClockFor(
  userId: string | null | undefined,
  pick: { userId: string; status: string } | null | undefined,
): boolean {
  if (!userId || !pick) return false;
  return pick.status === "onClock" && pick.userId === userId;
}

// ---------------------------------------------------------------------------
// Pool seeding (uses Prisma — the one non-pure export from this module).
// ---------------------------------------------------------------------------

export type SeedRookiePoolResult = {
  /** Rows inserted into DraftPoolPlayer. Zero on a re-seed of an already-
   *  populated pool (createMany with skipDuplicates collapses collisions). */
  inserted: number;
  /** Candidates the rookie filter matched in SleeperPlayer. Useful for
   *  admin UI: "Seeded 62 rookies (42 inserted, 20 already in pool)." */
  matched: number;
};

/**
 * Populates DraftPoolPlayer from SleeperPlayer, filtered to fantasy-
 * relevant rookies: QB/RB/WR/TE with `yearsExp=0` and a current NFL team.
 * Safe to call repeatedly — the unique (draftId, playerId) lets
 * createMany skip collisions without raising.
 *
 * Notes:
 *   * Depends on `years_exp` being populated by the extended
 *     runPlayersSync in src/lib/sleeper.ts. Run a players sync first
 *     (admin button on the MLF admin page) if the column is all NULL.
 *   * UDFAs are captured automatically: the Sleeper payload marks them
 *     `yearsExp=0` once they sign to a roster.
 *   * `active=true` filter drops retired-mid-camp edge cases.
 */
export async function seedRookiePool(
  prisma: PrismaClient,
  draftId: string,
  seededBy: string,
): Promise<SeedRookiePoolResult> {
  const players = await prisma.sleeperPlayer.findMany({
    where: {
      yearsExp: 0,
      team: { not: null },
      position: { in: [...ROOKIE_POSITIONS] },
      active: true,
    },
    select: { playerId: true },
  });

  if (players.length === 0) {
    return { inserted: 0, matched: 0 };
  }

  const result = await prisma.draftPoolPlayer.createMany({
    data: players.map((p) => ({
      draftId,
      playerId: p.playerId,
      addedBy: seededBy,
    })),
    skipDuplicates: true,
  });

  return { inserted: result.count, matched: players.length };
}
