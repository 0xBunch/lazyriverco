"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  isAdmin: boolean;
};

type Tab = "standings" | "rosters" | "transactions";

const TABS = new Set<Tab>(["standings", "rosters", "transactions"]);

function parseTab(raw: string | null): Tab | null {
  return raw && TABS.has(raw as Tab) ? (raw as Tab) : null;
}

function parseRosterId(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function SleeperOverview({ initial, isAdmin }: Props) {
  const searchParams = useSearchParams();
  const initialTab = parseTab(searchParams?.get("tab") ?? null) ?? "standings";
  const initialRoster = parseRosterId(searchParams?.get("roster") ?? null);

  const [data, setData] = useState<LeagueOverview>(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
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
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 pt-20 md:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-950 text-balance">
            {data.leagueName}
          </h1>
          <p className="mt-1 text-sm text-bone-700 text-pretty">
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
              "inline-flex items-center gap-2 rounded-md border border-bone-300 bg-bone-100 px-3 py-1.5 text-sm text-bone-900 transition-colors",
              "hover:border-claude-500 hover:text-claude-900",
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
          className="rounded-md border border-claude-700/70 bg-claude-900/40 px-3 py-2 text-sm text-claude-900"
        >
          {syncError}
        </div>
      ) : null}

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
          <RostersPanel rosters={data.rosters} initialRosterId={initialRoster} />
        ) : (
          <TransactionsList transactions={data.recentTransactions} />
        )}
      </section>
    </div>
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
          ? "border-claude-500 bg-claude-900/30 text-claude-900"
          : "border-bone-300 bg-bone-100 text-bone-700 hover:text-bone-900",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function StandingsTable({ rows }: { rows: StandingsRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-bone-600">No standings yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-sm border border-bone-200 bg-bone-100">
      <table className="w-full text-sm">
        <thead className="border-b border-bone-200 text-left text-bone-600">
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
              className="border-b border-bone-200/60 last:border-0"
            >
              <td className="px-3 py-2 text-bone-700 tabular-nums">{r.rank}</td>
              <td className="px-3 py-2 text-bone-900">
                {r.managerDisplayName}
              </td>
              <td className="px-3 py-2 text-bone-700">
                {r.teamName ? (
                  <Link
                    href={`/sports/mlf?tab=rosters&roster=${r.rosterId}`}
                    className="rounded-sm text-bone-900 underline decoration-bone-300 underline-offset-2 transition-colors hover:decoration-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
                  >
                    {r.teamName}
                  </Link>
                ) : (
                  <Link
                    href={`/sports/mlf?tab=rosters&roster=${r.rosterId}`}
                    aria-label={`View ${r.managerDisplayName}'s roster`}
                    className="rounded-sm text-bone-700 underline decoration-bone-300 underline-offset-2 transition-colors hover:decoration-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
                  >
                    {r.managerDisplayName}
                  </Link>
                )}
              </td>
              <td className="px-3 py-2 text-right text-bone-900 tabular-nums">
                {r.wins}-{r.losses}
                {r.ties ? `-${r.ties}` : ""}
              </td>
              <td className="px-3 py-2 text-right text-bone-800 tabular-nums">
                {r.pointsFor.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right text-bone-700 tabular-nums">
                {r.pointsAgainst.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RostersPanel({
  rosters,
  initialRosterId,
}: {
  rosters: RosterDetail[];
  initialRosterId: number | null;
}) {
  const seedId =
    initialRosterId !== null &&
    rosters.some((r) => r.rosterId === initialRosterId)
      ? initialRosterId
      : (rosters[0]?.rosterId ?? null);
  const [selected, setSelected] = useState<number | null>(seedId);
  const current = rosters.find((r) => r.rosterId === selected) ?? rosters[0];
  if (!current) {
    return <p className="text-sm text-bone-600">No rosters yet.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto pr-2 md:border-r md:border-bone-200">
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
                  ? "bg-claude-900/30 text-claude-900"
                  : "text-bone-700 hover:bg-bone-100 hover:text-bone-900",
              )}
            >
              <span className="block font-medium">{r.managerDisplayName}</span>
              {r.teamName ? (
                <span className="block text-xs text-bone-600">
                  {r.teamName}
                </span>
              ) : null}
            </button>
          );
        })}
      </aside>
      <div>
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-bone-950">
            {current.teamName ?? current.managerDisplayName}
          </h2>
          <span className="text-sm text-bone-700 tabular-nums">
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
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-bone-600">
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
                className="flex items-baseline justify-between gap-2 rounded-md border border-transparent px-2 py-1 text-sm transition-colors hover:border-bone-200 hover:bg-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
              >
                <span className="min-w-0 truncate text-bone-900">
                  <span className="mr-2 inline-block w-8 text-bone-600 tabular-nums">
                    {p.position ?? "??"}
                  </span>
                  {p.name}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-bone-600 tabular-nums">
                  {statTail ? (
                    <span className="text-bone-700">{statTail}</span>
                  ) : null}
                  {p.team ? <span>{p.team}</span> : null}
                  {p.injuryStatus ? (
                    <span className="rounded border border-claude-700/60 px-1 text-claude-800">
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
    return <p className="text-sm text-bone-600">No transactions yet.</p>;
  }
  const freeAgents = transactions.filter((t) => t.type === "free_agent");
  const waivers = transactions.filter((t) => t.type === "waiver");
  const other = transactions.filter(
    (t) => t.type === "trade" || t.type === "commissioner",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <TxColumn title="Free agents" items={freeAgents} emptyLabel="No free agent moves yet." />
        <TxColumn title="Waivers" items={waivers} emptyLabel="No waiver moves yet." />
      </div>
      {other.length > 0 ? (
        <TxColumn title="Other moves" items={other} emptyLabel="" showTypeBadge />
      ) : null}
    </div>
  );
}

function TxColumn({
  title,
  items,
  emptyLabel,
  showTypeBadge = false,
}: {
  title: string;
  items: LeagueOverview["recentTransactions"];
  emptyLabel: string;
  showTypeBadge?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 font-display text-xs font-semibold uppercase tracking-widest text-bone-700">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-bone-600">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((t) => (
            <li
              key={t.transactionId}
              className="rounded-md border border-bone-200 bg-bone-100 p-2 text-xs"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-bone-700">
                {showTypeBadge ? <TypeBadge type={t.type} /> : null}
                <span>
                  Week {t.week}
                  {t.creatorManager ? ` · ${t.creatorManager}` : ""}
                </span>
                <span className="ml-auto text-bone-500 tabular-nums">
                  {formatRelative(t.createdAt)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-col gap-1 text-bone-900">
                {t.adds.length > 0 ? (
                  <div>
                    <span className="text-bone-600">adds:</span>{" "}
                    {t.adds.map((a, i) => (
                      <span key={`${a.player.playerId}-${i}`}>
                        {i > 0 ? ", " : ""}
                        {a.managerDisplayName ? (
                          <span className="text-bone-700">
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
                    <span className="text-bone-600">drops:</span>{" "}
                    {t.drops.map((d, i) => (
                      <span key={`${d.player.playerId}-${i}`}>
                        {i > 0 ? ", " : ""}
                        {d.managerDisplayName ? (
                          <span className="text-bone-700">
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
                  <div className="text-[11px] text-bone-600">
                    includes draft picks
                  </div>
                ) : null}
                {t.includesWaiverBudget ? (
                  <div className="text-[11px] text-bone-600">
                    includes waiver budget
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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
    <span className="rounded-full border border-bone-300 bg-bone-200/60 px-2 py-0.5 text-[11px] uppercase tracking-wider text-bone-700">
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
