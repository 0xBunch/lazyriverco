import { prisma } from "@/lib/prisma";
import { LeagueScoreboard } from "../_components/LeagueScoreboard";
import { CrossLeagueRail } from "../_components/CrossLeagueRail";

export const dynamic = "force-dynamic";
export const metadata = { title: "NFL — MLSN" };

// Per-league scoreboard page. Replaces the "under construction"
// skeleton with a real focal scoreboard (left, 8/12) + cross-league
// rail (right, 4/12). Auth gating is handled by the (portal)
// middleware — no per-page redirect needed.
//
// Window logic:
//   - Focal scoreboard: -36h to +18h. Captures yesterday's results,
//     today's slate (in-progress + scheduled), and tomorrow's early
//     games (e.g., 1pm ET kickoffs are 17:00 UTC, fits the window).
//   - Cross-league rail: -6h to +18h. Today-only, the rail's job is
//     "what else is happening now / next."

const SPORT = "NFL" as const;

export default async function NflPage() {
  const now = new Date();
  const focalLo = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const focalHi = new Date(now.getTime() + 18 * 60 * 60 * 1000);
  const crossLo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const crossHi = new Date(now.getTime() + 18 * 60 * 60 * 1000);

  const [focal, cross] = await Promise.all([
    prisma.sportsScheduleGame.findMany({
      where: {
        sport: SPORT,
        hidden: false,
        gameTime: { gte: focalLo, lt: focalHi },
      },
      orderBy: { gameTime: "desc" },
    }),
    prisma.sportsScheduleGame.findMany({
      where: {
        sport: { not: SPORT, in: ["NFL", "NBA", "MLB", "NHL"] },
        hidden: false,
        gameTime: { gte: crossLo, lt: crossHi },
      },
      orderBy: { gameTime: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-16 lg:px-10">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600">
        MLSN · NFL
      </p>
      <h1 className="mt-4 font-nippo text-4xl font-bold tracking-tight text-bone-950 md:text-6xl">
        NFL
      </h1>

      {/* Off-season UX (per product-assassin 2026-04-30 review):
          when the focal league has no games, drop the cross-league
          rail entirely. A page titled "NFL" should not become an MLB
          page in NFL clothing. The empty-state inside LeagueScoreboard
          carries a link back to /sports for the cross-league surface. */}
      {focal.length === 0 ? (
        <div className="mt-10 max-w-2xl">
          <LeagueScoreboard league={SPORT} games={focal} now={now} />
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-6 lg:gap-10">
          <div className="md:col-span-8">
            <LeagueScoreboard league={SPORT} games={focal} now={now} />
          </div>
          <div className="md:col-span-4">
            <CrossLeagueRail focal={SPORT} games={cross} />
          </div>
        </div>
      )}
    </main>
  );
}
