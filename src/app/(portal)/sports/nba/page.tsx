import { prisma } from "@/lib/prisma";
import { LeagueScoreboard } from "../_components/LeagueScoreboard";
import { CrossLeagueRail } from "../_components/CrossLeagueRail";

export const dynamic = "force-dynamic";
export const metadata = { title: "NBA — MLSN" };

// See nfl/page.tsx for the window-logic rationale (-36h focal,
// today-only cross-league rail). Same shape for every major league.

const SPORT = "NBA" as const;

export default async function NbaPage() {
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
        MLSN · NBA
      </p>
      <h1 className="mt-4 font-nippo text-4xl font-bold tracking-tight text-bone-950 md:text-6xl">
        NBA
      </h1>

      {/* Off-season UX — see nfl/page.tsx for rationale. */}
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
