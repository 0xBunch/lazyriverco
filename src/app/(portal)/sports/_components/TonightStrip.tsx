import { SectionHeader } from "./SectionHeader";
import { LiveDot } from "./LiveDot";
import type { SportsScheduleGame } from "@prisma/client";

/// Schedule strip for the right rail. Shows the next 3 games (desktop)
/// or 2 (mobile) with team abbreviations, kickoff time, and a network
/// pill. Live games get the amber-tinted card border + LiveDot in the
/// status line.
///
/// Score rendering (added 2026-04-30, PR 3): when the upstream sync
/// (Trigger.dev `sync-{live,today,week}-games` tasks) populates the
/// awayScore + homeScore columns, the team-abbreviation column gains
/// a tabular-nums score numeral. SCHEDULED rows render empty scores
/// regardless. LIVE rows additionally show the period (and clock if
/// present) inline with the LiveDot. The time-of-game line dims to a
/// secondary slate on LIVE/FINAL rows so the score does the lifting.
///
/// Empty state: "Nothing on the schedule yet." Admin sees a CTA link
/// to the admin/sports/schedule page.
export function TonightStrip({
  games,
  isAdmin,
}: {
  games: SportsScheduleGame[];
  isAdmin: boolean;
}) {
  return (
    <section className="rounded-sm border border-bone-200 bg-bone-100 p-5 md:p-7">
      <SectionHeader
        label="Tonight · Where to watch"
        srTitle="Tonight's schedule"
        trailing={
          isAdmin ? (
            <a
              href="/admin/sports/schedule"
              className="text-xs text-claude-700 transition-colors hover:text-claude-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Manage →
            </a>
          ) : null
        }
      />
      {games.length === 0 ? (
        <p className="mt-5 text-sm text-bone-600">
          Nothing on the schedule yet.
        </p>
      ) : (
        <ul className="mt-5 space-y-2.5 md:space-y-3">
          {games.map((game, i) => (
            <li
              key={game.id}
              // 3rd card hidden on mobile to keep the strip compact.
              className={i >= 2 ? "hidden md:block" : ""}
            >
              <ScheduleCard game={game} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Hoisted to module scope — constructing Intl.DateTimeFormat inside the
// render path allocates a fresh formatter for every schedule card on
// every render. One shared instance is plenty.
const SCHEDULE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

// Reference: ESPN's mobile gameday strip — the "score wins, abbreviation
// is its label" hierarchy on a finished or live row. Anti-reference: a
// generic two-column scoreboard where score and team are typographic
// peers (Yahoo Fantasy's classic 2-line shape) — that pattern reads as
// "stat block" not "live broadcast". Keep this card biased toward the
// ESPN/score-forward shape on LIVE/FINAL; SCHEDULED stays as the
// existing where-to-watch-tonight surface.
function ScheduleCard({ game }: { game: SportsScheduleGame }) {
  const isLive = game.status === "LIVE";
  const isFinal = game.status === "FINAL";
  // Scores render only when the upstream sync (or admin entry) has
  // populated them. SCHEDULED rows always show empty score columns;
  // LIVE/FINAL rows show scores when present, fall back to empty if
  // null (e.g., upstream lag between status flip and score arrival).
  const hasScores =
    (isLive || isFinal) &&
    typeof game.awayScore === "number" &&
    typeof game.homeScore === "number";

  const cardClasses = isLive
    ? "flex items-center gap-3 rounded-sm border border-sports-amber/60 bg-sports-amber/15 p-3"
    : "flex items-center gap-3 rounded-sm border border-bone-200 bg-bone-100 p-3";

  // Per design-oracle 2026-04-30: when scores are present, demote the
  // abbreviation to bone-600 + medium weight so the bone-950 +
  // semibold score numeral reads as the hero. Same size, different
  // weight + color — matches ESPN's mobile gameday card hierarchy.
  // SCHEDULED (no scores yet) keeps the abbreviation at its existing
  // bone-950 + semibold so the team identity stays the focal point.
  const abbrClasses = hasScores
    ? "font-display text-xs font-medium text-bone-600 md:text-sm"
    : "font-display text-xs font-semibold text-bone-950 md:text-sm";

  const inner = (
    <>
      <div className="flex w-16 flex-col items-end gap-0.5 leading-none md:w-20 md:gap-1">
        <span className="flex items-baseline gap-1.5">
          <span className={abbrClasses}>{game.awayTeam}</span>
          {hasScores ? (
            <span className="font-display text-xs font-semibold tabular-nums text-bone-950 md:text-sm">
              {game.awayScore}
            </span>
          ) : null}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className={abbrClasses}>@ {game.homeTeam}</span>
          {hasScores ? (
            <span className="font-display text-xs font-semibold tabular-nums text-bone-950 md:text-sm">
              {game.homeScore}
            </span>
          ) : null}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {isLive ? (
          <div className="flex items-center gap-1.5">
            <LiveDot className="h-1.5 w-1.5" />
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-mlsn-500">
              Live
            </span>
            {/* Period + clock when the upstream sync provides them.
                Per design-oracle 2026-04-30: drop the eyebrow tracking
                so it reads as data, not a second label. The "Live"
                tag carries the eyebrow treatment for both. */}
            {game.period ? (
              <span className="font-display text-[10px] font-medium tracking-normal text-bone-700">
                · {game.period}
                {game.clock ? ` ${game.clock}` : ""}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600">
            {isFinal ? "Final" : "Tonight"}
          </span>
        )}
        {/* Time-of-game stays visible on SCHEDULED rows (the schedule's
            primary value). On LIVE/FINAL it becomes scaffolding — the
            score + status do the work — so dim it. */}
        <p
          className={`mt-0.5 text-sm tabular-nums ${
            isLive || isFinal ? "text-bone-700" : "text-bone-900"
          }`}
        >
          {SCHEDULE_TIME_FORMAT.format(game.gameTime)}
        </p>
      </div>
      {game.network ? (
        <span className="rounded-full bg-bone-50 px-2.5 py-0.5 text-[10px] tracking-widest text-bone-900 ring-1 ring-bone-300 md:px-3 md:py-1 md:text-[11px]">
          {game.network}
        </span>
      ) : null}
    </>
  );

  if (game.watchUrl) {
    return (
      <a
        href={game.watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cardClasses} transition-colors hover:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500`}
      >
        {inner}
      </a>
    );
  }
  return <div className={cardClasses}>{inner}</div>;
}
