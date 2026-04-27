import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { seedPool, addPlayerToPool, togglePlayerRemoved } from "./actions";

export const metadata = { title: "Rookie pool · Admin" };

type Search = { msg?: string; error?: string; q?: string };

// A touch of Ive: active rookies on top — the eye lands on what's real.
// Removed rookies slide to a muted footer list. Counts foreground the
// "is this thing loaded?" question a commissioner actually asks.

export default async function PoolPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Search;
}) {
  const draft = await prisma.draftRoom.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, status: true },
  });
  if (!draft) notFound();

  const pool = await prisma.draftPoolPlayer.findMany({
    where: { draftId: draft.id },
    include: {
      player: {
        select: {
          playerId: true,
          fullName: true,
          position: true,
          team: true,
          yearsExp: true,
        },
      },
    },
    orderBy: [{ removed: "asc" }, { createdAt: "desc" }],
  });

  const active = pool.filter((p) => !p.removed);
  const dropped = pool.filter((p) => p.removed);

  // Candidates for "Add player" dropdown: skill-position rookies NOT
  // already in pool (active or removed). Capped at 60 so the <select>
  // stays usable. Sort by last name so it's scannable.
  const inPoolIds = new Set(pool.map((p) => p.playerId));
  const q = searchParams.q?.trim().toLowerCase();
  const searchCandidates = await prisma.sleeperPlayer.findMany({
    where: {
      active: true,
      team: { not: null },
      position: { in: ["QB", "RB", "WR", "TE"] },
      OR: q
        ? [
            { fullName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { team: { contains: q.toUpperCase() } },
          ]
        : undefined,
    },
    select: {
      playerId: true,
      fullName: true,
      lastName: true,
      position: true,
      team: true,
      yearsExp: true,
    },
    orderBy: [{ lastName: "asc" }],
    take: 60,
  });
  const addable = searchCandidates.filter((p) => !inPoolIds.has(p.playerId));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/admin/sports/mlf/draft/${draft.id}`}
          className="text-xs uppercase tracking-[0.18em] text-bone-400 hover:text-bone-200"
        >
          ← {draft.name}
        </Link>
        <h2 className="font-display text-xl font-semibold tracking-tight text-bone-50">
          Rookie pool
        </h2>
        <p className="max-w-2xl text-sm text-bone-300">
          Seed the pool from Sleeper (QB / RB / WR / TE with{" "}
          <code className="rounded bg-bone-900 px-1 py-0.5 text-[0.85em]">yearsExp = 0</code>{" "}
          and an NFL team), then add or cut individual rookies. Removed
          rows stay on file — restore anytime.
        </p>
      </header>

      <Flash search={searchParams} />

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-bone-50">
            Auto-seed from Sleeper
          </h3>
          <form action={seedPool}>
            <input type="hidden" name="draftId" value={draft.id} />
            <button
              type="submit"
              className="rounded-md border border-claude-500/60 bg-claude-900/40 px-3 py-1.5 text-sm font-semibold text-claude-200 transition hover:bg-claude-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Seed rookies
            </button>
          </form>
        </div>
        <p className="mt-2 text-xs text-bone-400">
          Idempotent — safe to run twice. Skips rookies already in the pool.
          Depends on <code className="rounded bg-bone-950 px-1 py-0.5 font-mono text-[0.85em]">SleeperPlayer.yearsExp</code>{" "}
          being populated — run a players sync first if counts come back
          zero.
        </p>
      </section>

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-bone-50">
            Active pool
          </h3>
          <span className="font-mono text-xs tabular-nums text-bone-400">
            {active.length} players
          </span>
        </div>
        {active.length === 0 ? (
          <p className="mt-3 italic text-sm text-bone-400">
            Boards clean. Seed the pool or add a player below.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-bone-800/60 rounded-lg border border-bone-800">
            {active.map((row) => (
              <PoolRow key={row.id} row={row} draftId={draft.id} />
            ))}
          </ul>
        )}
      </section>

      {dropped.length > 0 && (
        <section className="rounded-2xl border border-bone-800 bg-bone-950/50 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-bone-400">
              Removed
            </h3>
            <span className="font-mono text-xs tabular-nums text-bone-500">
              {dropped.length}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-bone-800/60 rounded-lg border border-bone-800/40">
            {dropped.map((row) => (
              <PoolRow key={row.id} row={row} draftId={draft.id} muted />
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Add a player
        </h3>
        <p className="mt-1 text-xs text-bone-400">
          Searchable QB/RB/WR/TE from Sleeper; UDFAs appear as soon as
          they sign to a roster. Notes are optional — useful for &ldquo;late
          UDFA&rdquo; or &ldquo;hand-flagged sleeper.&rdquo;
        </p>
        <form
          action={addPlayerToPool}
          className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
        >
          <input type="hidden" name="draftId" value={draft.id} />
          <div>
            <label className="text-xs font-medium text-bone-200" htmlFor="playerId">
              Player
            </label>
            <select
              id="playerId"
              name="playerId"
              required
              className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            >
              <option value="">— pick a rookie —</option>
              {addable.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.fullName} · {p.position} · {p.team}
                  {p.yearsExp === 0 ? " · rookie" : p.yearsExp ? ` · exp ${p.yearsExp}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-bone-200" htmlFor="note">
              Note (optional)
            </label>
            <input
              id="note"
              type="text"
              name="note"
              maxLength={120}
              placeholder="late UDFA · hand-flagged"
              className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-[38px] rounded-md bg-claude-500 px-4 text-sm font-semibold text-bone-950 transition hover:bg-claude-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Add
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PoolRow({
  row,
  draftId,
  muted,
}: {
  row: {
    id: string;
    removed: boolean;
    note: string | null;
    player: {
      playerId: string;
      fullName: string | null;
      position: string | null;
      team: string | null;
      yearsExp: number | null;
    };
  };
  draftId: string;
  muted?: boolean;
}) {
  const name = row.player.fullName ?? row.player.playerId;
  return (
    <li
      className={
        muted
          ? "flex items-center gap-4 bg-bone-950/30 px-4 py-2 text-sm text-bone-500"
          : "flex items-center gap-4 px-4 py-2 text-sm text-bone-100"
      }
    >
      <span className="font-display font-semibold" style={muted ? { textDecoration: "line-through" } : undefined}>
        {name}
      </span>
      <span className="font-mono text-xs text-bone-400">
        {row.player.position ?? "?"} · {row.player.team ?? "FA"}
      </span>
      {row.note && (
        <span className="truncate text-xs italic text-bone-400">{row.note}</span>
      )}
      <div className="ml-auto">
        <form action={togglePlayerRemoved}>
          <input type="hidden" name="draftId" value={draftId} />
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="removed" value={String(row.removed)} />
          <button
            type="submit"
            className={
              muted
                ? "rounded-md border border-bone-700 px-2 py-1 text-xs text-bone-300 hover:border-emerald-500/50 hover:text-emerald-200"
                : "rounded-md border border-bone-700 px-2 py-1 text-xs text-bone-300 hover:border-red-500/50 hover:text-red-200"
            }
          >
            {muted ? "Restore" : "Remove"}
          </button>
        </form>
      </div>
    </li>
  );
}

function Flash({ search }: { search: { msg?: string; error?: string } }) {
  if (!search.msg && !search.error) return null;
  return (
    <div
      className={
        search.error
          ? "rounded-md border border-red-500/50 bg-red-900/30 p-3 text-sm text-red-200"
          : "rounded-md border border-emerald-500/50 bg-emerald-900/30 p-3 text-sm text-emerald-200"
      }
    >
      {search.error ?? search.msg}
    </div>
  );
}
