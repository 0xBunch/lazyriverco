import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMlfStandings } from "@/lib/sleeper/standings";
import { getWagOfTheDay, getWagSerial } from "@/lib/sports/wag-rotation";
import { pickSponsorForToday } from "@/lib/sports/sponsor-rotation";
import { WagOfTheDay } from "./_components/WagOfTheDay";
import { MlfDraftBanner } from "./_components/MlfDraftBanner";
import { MlfStandingsRail } from "./_components/MlfStandingsRail";
import { TonightStrip } from "./_components/TonightStrip";
import { HeadlinesRail } from "./_components/HeadlinesRail";
import { HighlightsGrid } from "./_components/HighlightsGrid";
import { SponsorRailSquare } from "./_components/SponsorRailSquare";

export const dynamic = "force-dynamic";

// /sports — daily clubhouse front page. Right rail stacks Draft →
// Tonight·Where-to-watch → Square Sponsor → Full MLF Standings;
// Grid 2 (below) pairs Headlines and Highlights. Sponsors are
// square-only as of the rail restructure — billboards retired.
//
// MlsnHeaderBar (red, in /sports/layout.tsx) sits above this page —
// section-level branding lives in the bar, so this page goes
// straight into the content modules.

export default async function SportsLandingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/start");
  const isAdmin = user.role === "ADMIN";

  // Single batched read. Each module renders its own empty state if
  // its slice comes back empty/null, so a single missing data source
  // doesn't 500 the page.
  const now = new Date();
  const [wag, wagSerial, mlfStandings, headlines, highlights, schedule, sponsors] =
    await Promise.all([
      getWagOfTheDay(),
      getWagSerial(),
      getMlfStandings(),
      prisma.newsItem.findMany({
        where: { hidden: false, feed: { category: "SPORTS", enabled: true } },
        orderBy: { publishedAt: "desc" },
        take: 8,
        include: { feed: { select: { name: true } } },
      }),
      prisma.sportsHighlight.findMany({
        where: { hidden: false },
        orderBy: [{ sortOrder: "desc" }, { publishedAt: "desc" }],
        take: 6,
      }),
      // ±6h kickoff window so LIVE games (kickoff in past, still
      // playing) and recent FINALs stay visible. Without this, the
      // score-badge code path on TonightStrip (PR #124) was
      // unreachable — scores only render when status is LIVE/FINAL,
      // and a strict `gameTime: { gte: now }` filter excluded those
      // rows the moment kickoff passed. Chronological sort gives the
      // natural read order: "what just finished, what's playing now,
      // what's next."
      prisma.sportsScheduleGame.findMany({
        where: {
          hidden: false,
          gameTime: { gte: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
        },
        orderBy: { gameTime: "asc" },
        take: 6,
      }),
      // Square-only as of the rail restructure. Existing BILLBOARD or
      // image-less sponsors fall out of rotation until they're
      // re-uploaded as square art.
      prisma.sportsSponsor.findMany({
        where: { active: true, imageShape: "SQUARE" },
        orderBy: { displayOrder: "asc" },
      }),
    ]);

  const pickedSponsor = pickSponsorForToday(sponsors);
  const sponsor = pickedSponsor?.sponsor ?? null;

  const headlineItems = headlines.map((row) => ({
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    publishedAt: row.publishedAt,
    ingestedAt: row.ingestedAt,
    ogImageUrl: row.ogImageUrl,
    sport: row.sport,
    feedName: row.feed.name,
    tags: row.tags,
  }));

  return (
    <main className="w-full">
      {/* Grid 1 — WAG + right rail (Draft → Tonight → Sponsor → Standings) */}
      <section className="relative w-full">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 md:grid-cols-12 md:gap-6 md:px-6 md:py-12 lg:gap-10 lg:px-10">
          <WagOfTheDay data={wag} isAdmin={isAdmin} serial={wagSerial} />
          <div className="flex flex-col gap-6 md:col-span-5 lg:gap-10">
            <MlfDraftBanner />
            <TonightStrip games={schedule} isAdmin={isAdmin} />
            <SponsorRailSquare sponsor={sponsor} />
            <MlfStandingsRail data={mlfStandings} />
          </div>
        </div>
      </section>

      {/* Grid 2 — Headlines (cols 1-8) + Highlights (cols 9-12) */}
      <section className="relative w-full">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 md:grid-cols-12 md:gap-6 md:px-6 md:py-12 lg:gap-10 lg:px-10">
          <div className="md:col-span-8">
            <HeadlinesRail items={headlineItems} isAdmin={isAdmin} />
          </div>
          <div className="md:col-span-4">
            <HighlightsGrid items={highlights} isAdmin={isAdmin} />
          </div>
        </div>
      </section>

      <hr aria-hidden="true" className="h-px w-full border-0 bg-sports-amber/20" />

      <footer className="w-full">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 md:px-6 md:py-10 lg:px-10">
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-500">
            Lazy River · Sports · End of broadcast
          </span>
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] tabular-nums text-bone-500">
            v1
          </span>
        </div>
      </footer>
    </main>
  );
}
