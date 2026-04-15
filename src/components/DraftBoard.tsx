"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  PickResponse,
  PoolPlayerDTO,
  PoolResponse,
  RosterEntryDTO,
  RosterResponse,
} from "@/lib/draft";

type DraftBoardProps = {
  isAdmin: boolean;
};

function groupByDrafted(players: PoolPlayerDTO[]) {
  return {
    available: players.filter((p) => !p.drafted),
    drafted: players.filter((p) => p.drafted),
  };
}

export function DraftBoard({ isAdmin }: DraftBoardProps) {
  const [pool, setPool] = useState<PoolPlayerDTO[] | null>(null);
  const [roster, setRoster] = useState<RosterEntryDTO[] | null>(null);
  const [character, setCharacter] = useState<RosterResponse["character"] | null>(
    null,
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin add-player form state
  const [addName, setAddName] = useState("");
  const [addPosition, setAddPosition] = useState("QB");
  const [addTeam, setAddTeam] = useState("");
  const [addTagline, setAddTagline] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const loadAll = useCallback(async () => {
    const [poolRes, rosterRes] = await Promise.all([
      fetch("/api/draft/pool", { cache: "no-store" }),
      fetch("/api/draft/roster", { cache: "no-store" }),
    ]);
    if (!poolRes.ok || !rosterRes.ok) {
      throw new Error("failed to load draft data");
    }
    const poolData = (await poolRes.json()) as PoolResponse;
    const rosterData = (await rosterRes.json()) as RosterResponse;
    setPool(poolData.players);
    setRoster(rosterData.roster);
    setCharacter(rosterData.character);
  }, []);

  useEffect(() => {
    loadAll().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load");
    });
  }, [loadAll]);

  async function handlePick() {
    if (picking) return;
    setPicking(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/pick", { method: "POST" });
      const data = (await res.json()) as PickResponse;
      if (!res.ok || !("ok" in data && data.ok)) {
        setError(
          ("error" in data && data.error) || "Draft failed — try again.",
        );
        return;
      }
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPicking(false);
    }
  }

  async function handleAddPlayer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (addBusy) return;
    setAddBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: addName,
          position: addPosition,
          team: addTeam,
          tagline: addTagline || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? `Add failed (${res.status})`);
        return;
      }
      setAddName("");
      setAddTeam("");
      setAddTagline("");
      await loadAll();
    } finally {
      setAddBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/draft/pool?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? `Delete failed (${res.status})`);
      return;
    }
    await loadAll();
  }

  if (pool === null || roster === null || character === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-bone-400">
        Loading the draft room…
      </div>
    );
  }

  const { available, drafted } = groupByDrafted(pool);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 pt-20 md:pt-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50">
          The Draft Room
        </h1>
        <p className="mt-1 text-sm italic text-bone-300">
          {character.displayName} is on the clock.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-claude-500/30 bg-bone-900 p-6 shadow-lg">
          <div>
            <p className="text-xs uppercase tracking-wide text-claude-300">
              Commissioner action
            </p>
            <p className="mt-1 text-sm text-bone-200">
              Drop the hammer. Joey doesn&rsquo;t get to pick, you do.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePick}
            disabled={picking || available.length === 0}
            className={cn(
              "rounded-xl bg-claude-500 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-bone-50 transition-colors",
              "hover:bg-claude-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {picking
              ? "Picking…"
              : available.length === 0
                ? "Pool is empty"
                : "Barfdog's Pick"}
          </button>
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-bone-50">
            {character.displayName}&rsquo;s Roster
          </h2>
          <span className="text-xs text-bone-400">
            {roster.length} pick{roster.length === 1 ? "" : "s"}
          </span>
        </div>
        {roster.length === 0 ? (
          <p className="rounded-xl border border-dashed border-bone-700 px-4 py-6 text-center text-sm italic text-bone-400">
            No picks yet. Joey is still warming up.
          </p>
        ) : (
          <ol className="space-y-3">
            {roster.map((entry, index) => (
              <li
                key={entry.id}
                className="rounded-xl border border-bone-700 bg-bone-900 p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-claude-300">
                      Round {index + 1}
                    </span>
                    <p className="mt-0.5 text-base font-semibold text-bone-50">
                      {entry.playerName}{" "}
                      <span className="text-xs font-normal text-bone-400">
                        {entry.position}
                      </span>
                    </p>
                  </div>
                </div>
                {entry.commentary ? (
                  <p className="mt-2 border-l-2 border-claude-500/50 pl-3 text-sm italic text-bone-200">
                    &ldquo;{entry.commentary}&rdquo;
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-bone-50">
            Available pool
          </h2>
          <span className="text-xs text-bone-400">
            {available.length} remaining · {drafted.length} drafted
          </span>
        </div>
        {available.length === 0 ? (
          <p className="rounded-xl border border-dashed border-bone-700 px-4 py-6 text-center text-sm italic text-bone-400">
            The pool is dry. Add more players or enjoy the standings.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {available.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-bone-800 bg-bone-900 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-bone-50">
                    {p.playerName}{" "}
                    <span className="text-xs text-bone-400">
                      {p.position} · {p.team}
                    </span>
                  </p>
                  {p.tagline ? (
                    <p className="truncate text-xs italic text-bone-400">
                      {p.tagline}
                    </p>
                  ) : null}
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    className="rounded text-xs text-bone-400 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                    aria-label={`Remove ${p.playerName}`}
                  >
                    remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-bone-50">
            Add a player
          </h2>
          <form
            onSubmit={handleAddPlayer}
            className="grid gap-3 rounded-2xl border border-bone-700 bg-bone-900 p-4 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-bone-200">
                Player name
              </span>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
                className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-400 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-bone-200">Position</span>
              <select
                value={addPosition}
                onChange={(e) => setAddPosition(e.target.value)}
                className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              >
                {["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-bone-200">Team</span>
              <input
                value={addTeam}
                onChange={(e) => setAddTeam(e.target.value)}
                required
                className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-400 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-bone-200">
                Tagline <span className="text-bone-500">(optional)</span>
              </span>
              <input
                value={addTagline}
                onChange={(e) => setAddTagline(e.target.value)}
                className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-400 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={addBusy || !addName || !addTeam}
                className="rounded-lg bg-claude-500 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-claude-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addBusy ? "Adding…" : "Add to pool"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
