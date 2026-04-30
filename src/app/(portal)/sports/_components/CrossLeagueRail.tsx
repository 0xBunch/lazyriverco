import Link from "next/link";
import { LiveDot } from "./LiveDot";
import type { SportsScheduleGame, SportTag } from "@prisma/client";

/// Compact other-leagues rail rendered alongside LeagueScoreboard on
/// /sports/<league>/* pages. Each section header is a link back to
/// the league's own scoreboard page; under it, up to 3 of today's
/// games render as one-line rows.
///
/// Reference: ESPN's per-league page right-rail — tight rows with
/// score on the right, status pill in the middle. Anti-reference:
/// duplicating TonightStrip here — TonightStrip is the cross-league
/// surface on the landing; this rail's job is the opposite-direction
/// flow (you're on /sports/nfl, what's happening in NBA right now?).

// Only enum members defined in prisma SportTag are listed. New
// leagues get added in lock-step with the schema enum + their
// sub-page.
const LEAGUE_LABEL: Record<SportTag, string> = {
  NFL: "NFL",
  NBA: "NBA",
  MLB: "MLB",
  NHL: "NHL",
  MLS: "MLS",
  UFC: "UFC",
};

const LEAGUE_PATH: Partial<Record<SportTag, string>> = {
  NFL: "/sports/nfl",
  NBA: "/sports/nba",
  MLB: "/sports/mlb",
  NHL: "/sports/nhl",
};

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function CrossLeagueRail({
  /// Which league's sub-page is being rendered. We exclude that league
  /// from the rail (the focal column already covers it).
  focal,
  games,
}: {
  focal: SportTag;
  games: SportsScheduleGame[];
}) {
  const others = games.filter((g) => g.sport !== focal);
  if (others.length === 0) {
    return (
      <aside className="rounded-sm border border-bone-200 bg-bone-100 p-5">
        <h2 className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600">
          Around the leagues
        </h2>
        <p className="mt-3 text-sm text-bone-700">
          Nothing else on tap right now.
        </p>
      </aside>
    );
  }

  // Group by sport, in NFL → NBA → MLB → NHL order. Each group caps
  // at 3 rows to keep the rail compact regardless of how many games
  // are happening.
  const groups: { sport: SportTag; rows: SportsScheduleGame[] }[] = [];
  const order: SportTag[] = ["NFL", "NBA", "MLB", "NHL"];
  for (const sport of order) {
    if (sport === focal) continue;
    const rows = others.filter((g) => g.sport === sport).slice(0, 3);
    if (rows.length > 0) groups.push({ sport, rows });
  }

  return (
    <aside className="space-y-6">
      <h2 className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600">
        Around the leagues
      </h2>
      {groups.map((group) => (
        <section key={group.sport}>
          <SectionHead sport={group.sport} />
          <ul className="mt-2 space-y-1.5">
            {group.rows.map((game) => (
              <li key={game.id}>
                <CompactRow game={game} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

function SectionHead({ sport }: { sport: SportTag }) {
  const label = LEAGUE_LABEL[sport] ?? sport;
  const path = LEAGUE_PATH[sport];
  if (!path) {
    return (
      <h3 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-bone-700">
        {label}
      </h3>
    );
  }
  // Per design-oracle 2026-04-30: tracking-[0.2em] on the link
  // floated the arrow away from the label. Drop tracking on the
  // arrow span specifically so it visually bonds to the word and
  // reads as a destination CTA, not decoration.
  return (
    <Link
      href={path}
      className="group inline-flex items-baseline font-display text-xs font-semibold uppercase tracking-[0.2em] text-bone-700 transition-colors hover:text-bone-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className="ml-1 tracking-normal transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}

function CompactRow({ game }: { game: SportsScheduleGame }) {
  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";
  const hasScores =
    (isLive || isFinal) &&
    typeof game.awayScore === "number" &&
    typeof game.homeScore === "number";

  // The rail row collapses to: "PHI @ DAL · 7:30 PM" for SCHEDULED,
  // "PHI 24 @ DAL 27 · Final" for FINAL, etc. Status carries the
  // amber LiveDot but no period/clock — the focal column has space
  // for that detail; the rail trades it for compactness.
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-baseline gap-1.5 truncate">
        <span className={hasScores ? "font-medium text-bone-700" : "font-medium text-bone-900"}>
          {game.awayTeam}
        </span>
        {hasScores ? (
          <span className="font-semibold tabular-nums text-bone-950">
            {game.awayScore}
          </span>
        ) : null}
        <span className="text-bone-500">@</span>
        <span className={hasScores ? "font-medium text-bone-700" : "font-medium text-bone-900"}>
          {game.homeTeam}
        </span>
        {hasScores ? (
          <span className="font-semibold tabular-nums text-bone-950">
            {game.homeScore}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.18em]">
        {isLive ? (
          <>
            <LiveDot className="h-1 w-1" />
            <span className="text-mlsn-500">Live</span>
          </>
        ) : isFinal ? (
          <span className="text-bone-600">Final</span>
        ) : (
          <span className="tabular-nums text-bone-700">
            {TIME_FORMAT.format(game.gameTime)}
          </span>
        )}
      </span>
    </div>
  );
}
