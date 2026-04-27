import { prisma } from "@/lib/prisma";
import {
  createGame,
  deleteGame,
  toggleGameHidden,
  updateGameStatus,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { msg?: string; error?: string; show?: string };

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const;
const STATUSES = ["SCHEDULED", "LIVE", "FINAL", "POSTPONED"] as const;

export default async function AdminSportsSchedulePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;
  const showAll = searchParams?.show === "all";

  // Default view: upcoming games (gameTime >= now). Toggle ?show=all
  // to include past games for editing/cleanup.
  const games = await prisma.sportsScheduleGame.findMany({
    where: showAll ? {} : { gameTime: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
    orderBy: { gameTime: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      {flashMsg && (
        <p className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-200">
          {flashMsg}
        </p>
      )}
      {flashError && (
        <p className="rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-2 text-sm text-red-200">
          {flashError}
        </p>
      )}

      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-bone-300">
          Manual schedule entry for the /sports{" "}
          <strong className="font-semibold text-bone-100">TONIGHT</strong>{" "}
          module. Default view shows games from 6h ago through the future;
          flip to{" "}
          <a
            href={
              showAll
                ? "/admin/sports/schedule"
                : "/admin/sports/schedule?show=all"
            }
            className="text-claude-300 underline decoration-claude-700 underline-offset-2 hover:text-claude-200"
          >
            {showAll ? "upcoming only" : "all games"}
          </a>
          . LIVE status pulses amber on the public hero. Auto-sync from
          TheSportsDB / ESPN ships in a follow-up.
        </p>
      </div>

      <form
        action={createGame}
        className="space-y-3 rounded-2xl border border-bone-700 bg-bone-900 p-5"
      >
        <p className="font-display text-sm font-semibold text-bone-50">Add a game</p>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
          <select name="sport" required defaultValue="NFL" className={inputCls}>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            name="awayTeam"
            placeholder="Away team (e.g. DAL)"
            required
            maxLength={80}
            className={inputCls}
          />
          <input
            name="homeTeam"
            placeholder="Home team (e.g. PHI)"
            required
            maxLength={80}
            className={inputCls}
          />
          <select name="status" defaultValue="SCHEDULED" className={inputCls}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            name="gameTime"
            type="datetime-local"
            required
            aria-label="Game time"
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            name="network"
            placeholder="Network (e.g. ESPN)"
            maxLength={32}
            className={inputCls}
          />
          <input
            name="watchUrl"
            type="url"
            placeholder="Watch URL (optional)"
            maxLength={2048}
            className={inputCls}
          />
        </div>
        <div className="flex justify-end">
          <button type="submit" className={btnPrimaryCls}>
            Add game
          </button>
        </div>
      </form>

      {games.length === 0 ? (
        <p className="rounded-2xl border border-bone-800 bg-bone-950 p-6 text-center text-sm italic text-bone-400">
          {showAll
            ? "No games on the books at all."
            : "No upcoming games. Add one above to populate TONIGHT."}
        </p>
      ) : (
        <ul className="space-y-2">
          {games.map((game) => {
            const isPast = game.gameTime.getTime() < Date.now();
            const isLive = game.status === "LIVE";
            return (
              <li
                key={game.id}
                className={`rounded-xl border p-4 ${
                  game.hidden
                    ? "border-bone-800 bg-bone-950 opacity-60"
                    : isLive
                    ? "border-sports-amber/40 bg-sports-amber/5"
                    : "border-bone-700 bg-bone-900"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md bg-bone-800 px-2 py-0.5 text-[0.7rem] font-mono text-bone-300">
                    {game.sport}
                  </span>
                  <p className="font-display text-base font-semibold text-bone-50">
                    {game.awayTeam} @ {game.homeTeam}
                  </p>
                  <span className="text-xs tabular-nums text-bone-400">
                    {formatGameTime(game.gameTime)}
                  </span>
                  {game.network && (
                    <span className="rounded-full bg-bone-950 px-2 py-0.5 text-[0.7rem] tracking-widest text-bone-200 ring-1 ring-bone-700">
                      {game.network}
                    </span>
                  )}
                  {game.hidden && (
                    <span className="text-[0.7rem] uppercase tracking-widest text-bone-500">
                      Hidden
                    </span>
                  )}
                  {isPast && !isLive && (
                    <span className="text-[0.7rem] uppercase tracking-widest text-bone-500">
                      Past
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={updateGameStatus} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={game.id} />
                    <select
                      name="status"
                      defaultValue={game.status}
                      className="rounded-md border border-bone-700 bg-bone-800 px-2 py-1 text-xs text-bone-100"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={btnCls}>
                      Set status
                    </button>
                  </form>
                  <form action={toggleGameHidden}>
                    <input type="hidden" name="id" value={game.id} />
                    <button type="submit" className={btnCls}>
                      {game.hidden ? "Unhide" : "Hide"}
                    </button>
                  </form>
                  <form action={deleteGame}>
                    <input type="hidden" name="id" value={game.id} />
                    <button type="submit" className={btnDangerCls}>
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatGameTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const inputCls =
  "rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500";
const btnPrimaryCls =
  "rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const btnCls =
  "inline-flex items-center rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500";
const btnDangerCls =
  "inline-flex items-center rounded-md border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500";
