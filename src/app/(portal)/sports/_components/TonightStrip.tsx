import { SectionHeader } from "./SectionHeader";
import { LiveDot } from "./LiveDot";
import type { SportsScheduleGame } from "@prisma/client";

/// Schedule strip for the right rail. Shows the next 3 games (desktop)
/// or 2 (mobile) with team abbreviations, kickoff time, and a network
/// pill. Live games get the amber-tinted card border + LiveDot in the
/// status line.
///
/// Empty state: "Nothing on the schedule yet." Admin sees a CTA link
/// to the (yet-to-ship) admin/sports/schedule page.
export function TonightStrip({
  games,
  isAdmin,
}: {
  games: SportsScheduleGame[];
  isAdmin: boolean;
}) {
  return (
    <section className="rounded-sm border border-bone-800 bg-bone-900/40 p-5 md:p-7">
      <SectionHeader
        label="Tonight · Where to watch"
        srTitle="Tonight's schedule"
        trailing={
          isAdmin ? (
            <a
              href="/admin/sports/schedule"
              className="text-xs text-claude-300 transition-colors hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Manage →
            </a>
          ) : null
        }
      />
      {games.length === 0 ? (
        <p className="mt-5 text-sm text-bone-400">
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

function ScheduleCard({ game }: { game: SportsScheduleGame }) {
  const isLive = game.status === "LIVE";
  const cardClasses = isLive
    ? "flex items-center gap-3 rounded-sm border border-sports-amber/40 bg-sports-amber/5 p-3"
    : "flex items-center gap-3 rounded-sm border border-bone-800 bg-bone-950/40 p-3";

  const inner = (
    <>
      <div className="flex w-12 flex-col items-end gap-0.5 leading-none md:w-16 md:gap-1">
        <span className="font-display text-xs font-semibold text-bone-50 md:text-sm">
          {game.awayTeam}
        </span>
        <span className="font-display text-xs font-semibold text-bone-50 md:text-sm">
          @ {game.homeTeam}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {isLive ? (
          <div className="flex items-center gap-1.5">
            <LiveDot className="h-1.5 w-1.5" />
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-sports-amber">
              Live
            </span>
          </div>
        ) : (
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
            {game.status === "FINAL" ? "Final" : "Tonight"}
          </span>
        )}
        <p className="mt-0.5 text-sm tabular-nums text-bone-100">
          {SCHEDULE_TIME_FORMAT.format(game.gameTime)}
        </p>
      </div>
      {game.network ? (
        <span className="rounded-full bg-bone-950 px-2.5 py-0.5 text-[10px] tracking-widest text-bone-100 ring-1 ring-bone-700 md:px-3 md:py-1 md:text-[11px]">
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
