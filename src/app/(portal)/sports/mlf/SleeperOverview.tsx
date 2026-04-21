"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type {
  HydratedPlayer,
  RosterDetail,
  LeagueOverview,
  StandingsRow,
} from "@/lib/sleeper";

// Sleeper overview panel: standings / rosters / transactions tabs with
// an admin-only "Sync now" button that busts the server cache and
// refreshes the panel data in place. Client-only — the server page
// hydrates `initial` via getLeagueOverview() (Dates already serialized
// to ISO strings by the type contract).

type Props = {
  initial: LeagueOverview;
  narrative: string | null;
  isAdmin: boolean;
};

type Tab = "standings" | "rosters" | "transactions";

export function SleeperOverview({ initial, narrative, isAdmin }: Props) {
  const [data, setData] = useState<LeagueOverview>(initial);
  const [tab, setTab] = useState<Tab>("standings");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isRecap = data.mode === "recap";

  const onSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/sleeper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncPlayers: true }),
      });
      const body = (await res.json()) as {
        overview?: LeagueOverview;
        error?: string;
      };
      if (!res.ok || !body.overview) {
        setSyncError(body.error ?? `Sync failed (${res.status})`);
        return;
      }
      setData(body.overview);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, []);

  const lastSyncedRelative = useMemo(
    () => formatRelative(data.lastSyncedAt),
    [data.lastSyncedAt],
  );

  return (
    <div className="flex flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50 text-balance">
            {data.leagueName}
          </h1>
          <p className="mt-1 text-sm text-bone-300 text-pretty">
            {isRecap
              ? `${data.season} final standings · ${data.nflSeason} hasn't kicked off yet · synced ${lastSyncedRelative}`
              : `${data.season} season · NFL Week ${data.currentWeek} · synced ${lastSyncedRelative}`}
          </p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-bone-700 bg-bone-900 px-3 py-1.5 text-sm text-bone-100 transition-colors",
              "hover:border-claude-500 hover:text-claude-100",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        ) : null}
      </header>

      {syncError ? (
        <div
          role="alert"
          className="rounded-md border border-claude-700/70 bg-claude-900/40 px-3 py-2 text-sm text-claude-100"
        >
          {syncError}
        </div>
      ) : null}

      {narrative ? <NarrativeCard body={narrative} season={data.season} /> : null}

      <nav className="flex gap-2" aria-label="Fantasy view">
        <TabButton active={tab === "standings"} onClick={() => setTab("standings")}>
          Standings
        </TabButton>
        <TabButton active={tab === "rosters"} onClick={() => setTab("rosters")}>
          Rosters
        </TabButton>
        <TabButton
          active={tab === "transactions"}
          onClick={() => setTab("transactions")}
        >
          Transactions
        </TabButton>
      </nav>

      <section>
        {tab === "standings" ? (
          <StandingsTable rows={data.standings} />
        ) : tab === "rosters" ? (
          <RostersPanel rosters={data.rosters} />
        ) : (
          <TransactionsList transactions={data.recentTransactions} />
        )}
      </section>
    </div>
  );
}

function NarrativeCard({ body, season }: { body: string; season: string }) {
  return (
    <section
      aria-label={`${season} season narrative`}
      className="rounded-lg border border-bone-800 bg-gradient-to-br from-bone-900/60 to-bone-900/20 p-4 md:p-5"
    >
      <h2 className="mb-2 font-display text-xs font-semibold uppercase tracking-widest text-claude-300">
        How {season} went
      </h2>
      <p className="text-[15px] leading-relaxed text-bone-100 text-pretty">
        {body}
      </p>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-claude-500 bg-claude-900/30 text-claude-100"
          : "border-bone-700 bg-bone-900 text-bone-300 hover:text-bone-100",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function StandingsTable({ rows }: { rows: StandingsRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-bone-400">No standings yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-bone-800 bg-bone-900/40">
      <table className="w-full text-sm">
        <thead className="border-b border-bone-800 text-left text-bone-400">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Manager</th>
            <th className="px-3 py-2 font-medium">Team</th>
            <th className="px-3 py-2 text-right font-medium">Record</th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">
              PF
            </th>
            <th className="px-3 py-2 text-right font-medium tabular-nums">
              PA
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.rosterId}
              className="border-b border-bone-800/60 last:border-0"
            >
              <td className="px-3 py-2 text-bone-300 tabular-nums">{r.rank}</td>
              <td className="px-3 py-2 text-bone-100">
                {r.managerDisplayName}
              </td>
              <td className="px-3 py-2 text-bone-300">{r.teamName ?? "—"}</td>
              <td className="px-3 py-2 text-right text-bone-100 tabular-nums">
                {r.wins}-{r.losses}
                {r.ties ? `-${r.ties}` : ""}
              </td>
              <td className="px-3 py-2 text-right text-bone-200 tabular-nums">
                {r.pointsFor.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right text-bone-300 tabular-nums">
                {r.pointsAgainst.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RostersPanel({ rosters }: { rosters: RosterDetail[] }) {
  const [selected, setSelected] = useState<number | null>(
    rosters[0]?.rosterId ?? null,
  );
  const current = rosters.find((r) => r.rosterId === selected) ?? rosters[0];
  if (!current) {
    return <p className="text-sm text-bone-400">No rosters yet.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto pr-2 md:border-r md:border-bone-800">
        {rosters.map((r) => {
          const active = r.rosterId === current.rosterId;
          return (
            <button
              key={r.rosterId}
              type="button"
              onClick={() => setSelected(r.rosterId)}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "bg-claude-900/30 text-claude-100"
                  : "text-bone-300 hover:bg-bone-900 hover:text-bone-100",
              )}
            >
              <span className="block font-medium">{r.managerDisplayName}</span>
              {r.teamName ? (
                <span className="block text-xs text-bone-400">
                  {r.teamName}
                </span>
              ) : null}
            </button>
          );
        })}
      </aside>
      <div>
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-bone-50">
            {current.teamName ?? current.managerDisplayName}
          </h2>
          <span className="text-sm text-bone-300 tabular-nums">
            {current.wins}-{current.losses}
            {current.ties ? `-${current.ties}` : ""} ·{" "}
            {current.pointsFor.toFixed(1)} PF
          </span>
        </header>
        <RosterSection title="Starters" players={current.starters} />
        <RosterSection title="Bench" players={current.bench} />
        {current.reserve.length > 0 ? (
          <RosterSection title="IR" players={current.reserve} />
        ) : null}
        {current.taxi.length > 0 ? (
          <RosterSection title="Taxi" players={current.taxi} />
        ) : null}
      </div>
    </div>
  );
}

function RosterSection({
  title,
  players,
}: {
  title: string;
  players: HydratedPlayer[];
}) {
  if (players.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-bone-400">
        {title}
      </h3>
      <ul className="space-y-1">
        {players.map((p) => {
          const statTail =
            p.nextSeason && p.nextSeason.ptsPpr > 0
              ? `${p.nextSeason.ptsPpr.toFixed(0)} proj`
              : p.lastSeason && p.lastSeason.ptsPpr > 0
                ? `${p.lastSeason.ptsPpr.toFixed(0)} '${p.lastSeason.season.slice(-2)}`
                : null;
          return (
            <li key={p.playerId}>
              <Link
                href={`/sports/mlf/players/${encodeURIComponent(p.playerId)}`}
                className="flex items-baseline justify-between gap-2 rounded-md border border-transparent px-2 py-1 text-sm transition-colors hover:border-bone-800 hover:bg-bone-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
              >
                <span className="min-w-0 truncate text-bone-100">
                  <span className="mr-2 inline-block w-8 text-bone-400 tabular-nums">
                    {p.position ?? "??"}
                  </span>
                  {p.name}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-bone-400 tabular-nums">
                  {statTail ? (
                    <span className="text-bone-300">{statTail}</span>
                  ) : null}
                  {p.team ? <span>{p.team}</span> : null}
                  {p.injuryStatus ? (
                    <span className="rounded border border-claude-700/60 px-1 text-claude-200">
                      {p.injuryStatus}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TransactionsList({
  transactions,
}: {
  transactions: LeagueOverview["recentTransactions"];
}) {
  if (transactions.length === 0) {
    return <p className="text-sm text-bone-400">No transactions yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {transactions.map((t) => (
        <li
          key={t.transactionId}
          className="rounded-md border border-bone-800 bg-bone-900/40 p-3 text-sm"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <TypeBadge type={t.type} />
              <span className="text-bone-300">
                Week {t.week}
                {t.creatorManager ? ` · ${t.creatorManager}` : ""}
              </span>
            </span>
            <span className="text-xs text-bone-500 tabular-nums">
              {formatRelative(t.createdAt)}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1 text-bone-100">
            {t.adds.length > 0 ? (
              <div>
                <span className="text-bone-400">adds:</span>{" "}
                {t.adds.map((a, i) => (
                  <span key={`${a.player.playerId}-${i}`}>
                    {i > 0 ? ", " : ""}
                    {a.managerDisplayName ? (
                      <span className="text-bone-300">
                        {a.managerDisplayName} ←{" "}
                      </span>
                    ) : null}
                    <Link
                      href={`/sports/mlf/players/${encodeURIComponent(a.player.playerId)}`}
                      className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
                    >
                      {a.player.name}
                    </Link>
                  </span>
                ))}
              </div>
            ) : null}
            {t.drops.length > 0 ? (
              <div>
                <span className="text-bone-400">drops:</span>{" "}
                {t.drops.map((d, i) => (
                  <span key={`${d.player.playerId}-${i}`}>
                    {i > 0 ? ", " : ""}
                    {d.managerDisplayName ? (
                      <span className="text-bone-300">
                        {d.managerDisplayName} →{" "}
                      </span>
                    ) : null}
                    <Link
                      href={`/sports/mlf/players/${encodeURIComponent(d.player.playerId)}`}
                      className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
                    >
                      {d.player.name}
                    </Link>
                  </span>
                ))}
              </div>
            ) : null}
            {t.includesDraftPicks ? (
              <div className="text-xs text-bone-400">
                includes draft picks
              </div>
            ) : null}
            {t.includesWaiverBudget ? (
              <div className="text-xs text-bone-400">
                includes waiver budget
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  free_agent: "free agent",
  waiver: "waiver",
  trade: "trade",
  commissioner: "commish",
};

function TypeBadge({ type }: { type: string }) {
  const label = TRANSACTION_TYPE_LABEL[type] ?? type;
  return (
    <span className="rounded-full border border-bone-700 bg-bone-800/60 px-2 py-0.5 text-[11px] uppercase tracking-wider text-bone-300">
      {label}
    </span>
  );
}

// Relative time formatter — "just now", "5m ago", "3h ago", "2d ago", "Apr 12".
// Input is an ISO string from the server.
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
