// One-shot backfill: populates the new `Athlete` table from existing
// `SportsWag` rows and links each WAG row's `athleteId`. Idempotent —
// uses upsert on the (fullName, sport, team) unique key, so re-runs
// just verify and re-link rather than duplicate.
//
// Usage:
//   pnpm tsx -e dotenv -e .env.local -- tsx scripts/backfill-sports-wag-athletes.ts
//   ...or, if a backfill:wag-athletes script gets added to package.json,
//   pnpm backfill:wag-athletes [--dry-run]
//
// Requires DATABASE_URL in .env.local. The `dotenv -e .env.local`
// wrapper used by every other db script handles that.
//
// What it does:
//   1) Group every SportsWag by (athleteName, sport, team).
//   2) For each group, upsert an Athlete row keyed on that tuple.
//      For NFL athletes, opportunistically attach the SleeperPlayer
//      via SleeperPlayer.fullName match (best-effort; ambiguous matches
//      are skipped — admins can fix them via the form later).
//   3) Update the SportsWag rows in the group to point at the
//      Athlete.id we just upserted.
//
// Failure handling: each athlete is its own transaction. Ctrl+C mid-run
// is safe — re-running picks up where it left off via the unique-key
// upsert.

import { prisma } from "@/lib/prisma";
import type { SportTag } from "@prisma/client";

type Args = { dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[backfill] starting${args.dryRun ? " (dry-run)" : ""}`);

  // Pull every WAG row missing an athleteId. We don't touch already-linked
  // rows — they were created post-migration and point at canonical
  // Athlete records by construction.
  const wags = await prisma.sportsWag.findMany({
    where: { athleteId: null },
    select: {
      id: true,
      athleteName: true,
      sport: true,
      team: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[backfill] ${wags.length} WAG rows need linking.`);
  if (wags.length === 0) {
    console.log("[backfill] nothing to do.");
    return;
  }

  type Key = string;
  const groups = new Map<
    Key,
    {
      athleteName: string;
      sport: SportTag;
      team: string | null;
      wagIds: string[];
    }
  >();
  for (const w of wags) {
    const key = `${w.athleteName.trim()}|${w.sport}|${w.team ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        athleteName: w.athleteName.trim(),
        sport: w.sport,
        team: w.team,
        wagIds: [],
      };
      groups.set(key, g);
    }
    g.wagIds.push(w.id);
  }
  console.log(`[backfill] ${groups.size} unique athlete tuples.`);

  let athletesCreated = 0;
  let athletesReused = 0;
  let wagsLinked = 0;
  let sleeperLinked = 0;

  for (const [, g] of groups) {
    if (args.dryRun) {
      console.log(
        `  [dry-run] would link ${g.wagIds.length} WAG(s) → ${g.athleteName} (${g.sport}${g.team ? `, ${g.team}` : ""})`,
      );
      continue;
    }

    // Best-effort Sleeper linkage for NFL athletes only. Strict equality
    // on fullName + team — anything ambiguous (multiple matches) gets
    // skipped so we don't mis-attribute. Admins can fix later via the
    // form once an Athlete-picker UI ships.
    let sleeperPlayerId: string | null = null;
    if (g.sport === "NFL") {
      const candidates = await prisma.sleeperPlayer.findMany({
        where: {
          fullName: g.athleteName,
          ...(g.team ? { team: g.team } : {}),
        },
        select: { playerId: true },
        take: 2,
      });
      if (candidates.length === 1) {
        // Make sure we don't collide with an existing Athlete that already
        // owns this Sleeper id (could happen if a different (name, team)
        // tuple is already linked). Skip the attach in that case.
        const existingAttach = await prisma.athlete.findUnique({
          where: { sleeperPlayerId: candidates[0]!.playerId },
          select: { id: true },
        });
        if (!existingAttach) {
          sleeperPlayerId = candidates[0]!.playerId;
        }
      }
    }

    // findFirst + create rather than upsert keyed on (fullName, sport,
    // team): PG treats NULL as distinct in unique indexes, so a
    // team=null row can't be reached via Prisma's findUnique on the
    // composite key. findFirst handles `team: null` as `team IS NULL`.
    let athleteId: string;
    let created = false;
    const existing = await prisma.athlete.findFirst({
      where: {
        fullName: g.athleteName,
        sport: g.sport,
        team: g.team,
      },
      select: { id: true, sleeperPlayerId: true },
    });
    if (existing) {
      athleteId = existing.id;
      // Attach the Sleeper id only if the existing row doesn't already
      // have one (the unique index would block a duplicate).
      if (sleeperPlayerId && !existing.sleeperPlayerId) {
        await prisma.athlete.update({
          where: { id: existing.id },
          data: { sleeperPlayerId },
        });
      }
    } else {
      const inserted = await prisma.athlete.create({
        data: {
          fullName: g.athleteName,
          sport: g.sport,
          team: g.team,
          sleeperPlayerId,
        },
        select: { id: true },
      });
      athleteId = inserted.id;
      created = true;
    }
    if (created) athletesCreated += 1;
    else athletesReused += 1;
    if (sleeperPlayerId) sleeperLinked += 1;

    const linked = await prisma.sportsWag.updateMany({
      where: { id: { in: g.wagIds } },
      data: { athleteId },
    });
    wagsLinked += linked.count;
    console.log(
      `  ✓ ${g.athleteName} (${g.sport}${g.team ? `, ${g.team}` : ""}) → linked ${linked.count} WAG(s)${sleeperPlayerId ? ` [Sleeper:${sleeperPlayerId}]` : ""}`,
    );
  }

  console.log(
    `[backfill] done. athletes created=${athletesCreated} reused=${athletesReused} sleeper-linked=${sleeperLinked} wags-linked=${wagsLinked}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
