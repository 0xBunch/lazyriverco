import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMlfTopN } from "@/lib/sleeper/standings";
import { getWagOfTheDay } from "@/lib/sports/wag-rotation";
import { pickSponsorForToday } from "@/lib/sports/sponsor-rotation";
import { SportsHero } from "./_components/SportsHero";
import { WagOfTheDay } from "./_components/WagOfTheDay";
import { MlfDraftBanner } from "./_components/MlfDraftBanner";
import { MlfTopThree } from "./_components/MlfTopThree";
import { TonightStrip } from "./_components/TonightStrip";
import { HeadlinesRail } from "./_components/HeadlinesRail";
import { HighlightsGrid } from "./_components/HighlightsGrid";
import { SponsorBreakRail } from "./_components/SponsorBreakRail";

export const dynamic = "force-dynamic";

// /sports — daily clubhouse front page. Five modules: Headlines (RSS,
// reads from shipped NewsItem WHERE feed.category=SPORTS), WAG of the
// Day (editorial schedule), MLF Top 3 (Sleeper-backed, shipped),
// TONIGHT (admin-curated schedule, PR 4 adds auto-sync), Highlights
// (admin-curated YouTube, PR 3 adds auto-sync). Plus a rotating
// sponsor in two surfaces — hero presenter line + mid-page break.
//
// See docs/sports-landing-redesign.md for full design context. Visual
// reference: mockups/sports-desktop.html + mockups/sports-mobile.html.

export default async function SportsLandingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/start");
  const isAdmin = user.role === "ADMIN";

  // Single batched read. Each module renders its own empty state if
  // its slice comes back empty/null, so a single missing data source
  // doesn't 500 the page.
  //
  // headlinesCount + scheduleCount are separate from the list reads
  // because the lists `take: N` cap their result length — if we used
  // headlines.length the hero would always say "8 headlines" once the
  // feed is healthy, regardless of how many actually exist. Indexed
  // count() is cheap.
  const now = new Date();
  const [wag, mlf, headlines, highlights, schedule, liveCount, headlinesCount, gamesCount, sponsors] =
    await Promise.all([
      getWagOfTheDay(),
      getMlfTopN(3),
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
      prisma.sportsScheduleGame.findMany({
        where: { hidden: false, gameTime: { gte: now } },
        orderBy: { gameTime: "asc" },
        take: 6,
      }),
      prisma.sportsScheduleGame.count({
        where: { status: "LIVE", hidden: false },
      }),
      prisma.newsItem.count({
        where: { hidden: false, feed: { category: "SPORTS", enabled: true } },
      }),
      prisma.sportsScheduleGame.count({
        where: { hidden: false, gameTime: { gte: now } },
      }),
      prisma.sportsSponsor.findMany({
        where: { active: true },
        orderBy: { displayOrder: "asc" },
      }),
    ]);

  const pickedSponsor = pickSponsorForToday(sponsors);
  const sponsor = pickedSponsor?.sponsor ?? null;
  const sponsorIndex = pickedSponsor?.index ?? -1;

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
      <SportsHero
        liveCount={liveCount}
        totalGames={gamesCount}
        totalHeadlines={headlinesCount}
        sponsor={sponsor}
      />

      <hr aria-hidden="true" className="h-px w-full border-0 bg-sports-amber/40" />

      {/* Grid 1 — WAG + right-rail (MLF + TONIGHT) */}
      <section className="relative w-full">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 md:grid-cols-12 md:gap-6 md:px-6 md:py-12 lg:gap-10 lg:px-10">
          <WagOfTheDay data={wag} isAdmin={isAdmin} />
          <div className="flex flex-col gap-6 md:col-span-5 lg:gap-10">
            <MlfDraftBanner />
            <MlfTopThree data={mlf} />
            <TonightStrip games={schedule} isAdmin={isAdmin} />
          </div>
        </div>
      </section>

      {/* Mid-page broadcast break (renders nothing when no active sponsor) */}
      <SponsorBreakRail
        sponsor={sponsor}
        totalActive={sponsors.length}
        activeIndex={sponsorIndex}
      />

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
