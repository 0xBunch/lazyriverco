import { LiveDot } from "./LiveDot";
import type { SportsScheduleGame } from "@prisma/client";

/// Per-league scoreboard rendered as the main column on /sports/nfl,
/// /sports/nba, /sports/mlb, /sports/nhl. Replaces the "under
/// construction" skeletons that shipped with the sports landing.
///
/// Reference: ESPN's per-league scores page — score-forward card grid,
/// grouped by date (Today / Yesterday / Earlier), live cards pulse
/// amber. Anti-reference: a generic news-feed list interleaving
/// recaps with cards — that pattern de-emphasizes the score, which
/// is the reason a fan landed on /sports/nfl in the first place.
///
/// Empty state: "No <league> games on the schedule." Off-season is
/// the common case for a single league sub-page; the landing's
/// TonightStrip will still show whichever leagues do have games.
///
/// Score rendering matches TonightStrip (PR 3): bone-950 score
/// numerals demote the bone-600 abbreviation. SCHEDULED rows hide
/// the score column entirely.
export function LeagueScoreboard({
  league,
  games,
  now,
}: {
  league: "NFL" | "NBA" | "MLB" | "NHL";
  games: SportsScheduleGame[];
  now: Date;
}) {
  if (games.length === 0) {
    // Per design-oracle 2026-04-30: declarative line in larger type
    // first so the empty state reads as deliberate, not "data missing."
    // The link points back at the landing's TonightStrip — when this
    // league is dark, that's the surface that's still alive.
    return (
      <div className="rounded-sm border border-bone-200 bg-bone-100 p-8">
        <p className="font-display text-base font-semibold text-bone-900">
          {league} is between games.
        </p>
        <p className="mt-2 font-display text-sm text-bone-700">
          When the next slate hits, it lands here.{" "}
          <a
            href="/sports"
            className="text-claude-700 underline-offset-2 transition-colors hover:text-claude-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
          >
            See tonight&apos;s schedule
          </a>{" "}
          for what&apos;s on across the leagues.
        </p>
      </div>
    );
  }

  const groups = groupGamesByDay(games, now);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label}>
          {/* Per design-oracle 2026-04-30: this label frames the
              focal column's headline. Outweighs the rail's
              "Around the leagues" eyebrow (text-[10px]/0.28em/
              bone-600) so the page announces "this is today's
              slate" louder than "what else is on." */}
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-bone-900">
            {group.label}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {group.games.map((game) => (
              <li key={game.id}>
                <ScoreboardCard game={game} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});

type Group = { label: string; games: SportsScheduleGame[] };

/// Group games into "Today" / "Yesterday" / labeled past or future
/// days. UTC-rounded for consistency on the server — close enough
/// for the US-centric audience, and avoids the timezone-mismatch
/// bugs that come with locale-aware date splitting.
function groupGamesByDay(games: SportsScheduleGame[], now: Date): Group[] {
  const todayKey = utcDayKey(now);
  const yesterdayKey = utcDayKey(addDays(now, -1));

  const map = new Map<string, SportsScheduleGame[]>();
  for (const game of games) {
    const key = utcDayKey(game.gameTime);
    const list = map.get(key) ?? [];
    list.push(game);
    map.set(key, list);
  }

  // Sort the day buckets chronologically descending — most recent / today
  // first, future days after, past days last.
  const keys = [...map.keys()].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

  return keys.map((key) => {
    const games = map.get(key)!;
    let label: string;
    if (key === todayKey) label = "Today";
    else if (key === yesterdayKey) label = "Yesterday";
    else label = DAY_FORMAT.format(games[0].gameTime);
    return { label, games };
  });
}

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function ScoreboardCard({ game }: { game: SportsScheduleGame }) {
  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";
  const hasScores =
    (isLive || isFinal) &&
    typeof game.awayScore === "number" &&
    typeof game.homeScore === "number";

  const cardClasses = isLive
    ? "rounded-sm border border-sports-amber/60 bg-sports-amber/15 p-4"
    : "rounded-sm border border-bone-200 bg-bone-100 p-4";

  const teamRowClasses = "flex items-baseline justify-between gap-3";

  // Same hierarchy rule as TonightStrip: score wins, abbreviation
  // demotes when scores are present.
  const abbrClasses = hasScores
    ? "font-display text-sm font-medium text-bone-600"
    : "font-display text-sm font-semibold text-bone-950";

  const inner = (
    <div className={cardClasses}>
      {/* Status header — the eyebrow that frames the card's state. */}
      <div className="flex items-center justify-between">
        {isLive ? (
          <div className="flex items-center gap-1.5">
            <LiveDot className="h-1.5 w-1.5" />
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-mlsn-500">
              Live
            </span>
            {game.period ? (
              <span className="font-display text-[10px] font-medium tracking-normal text-bone-700">
                · {game.period}
                {game.clock ? ` ${game.clock}` : ""}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600">
            {isFinal ? "Final" : TIME_FORMAT.format(game.gameTime)}
          </span>
        )}
        {game.network ? (
          <span className="rounded-full bg-bone-50 px-2 py-0.5 text-[10px] tracking-widest text-bone-900 ring-1 ring-bone-300">
            {game.network}
          </span>
        ) : null}
      </div>

      {/* Team rows — each row is a horizontal pair (abbr left, score
          right) so eye scans down the score column for quick reads. */}
      <div className="mt-3 space-y-1.5">
        <div className={teamRowClasses}>
          <span className={abbrClasses}>{game.awayTeam}</span>
          {hasScores ? (
            <span className="font-display text-base font-semibold tabular-nums text-bone-950">
              {game.awayScore}
            </span>
          ) : null}
        </div>
        <div className={teamRowClasses}>
          <span className={abbrClasses}>{game.homeTeam}</span>
          {hasScores ? (
            <span className="font-display text-base font-semibold tabular-nums text-bone-950">
              {game.homeScore}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (game.watchUrl) {
    return (
      <a
        href={game.watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition-colors hover:[&>div]:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
      >
        {inner}
      </a>
    );
  }
  return inner;
}
