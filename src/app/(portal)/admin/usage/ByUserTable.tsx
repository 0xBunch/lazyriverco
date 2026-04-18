"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// Sortable per-user breakdown. N <= 7 at the phase-1 clubhouse scale,
// so client-side sort over an already-fetched array is faster and
// simpler than round-tripping sort state to the server. Row clicks
// navigate to /admin/usage/[id].

export type UsageByUserRow = {
  userId: string | null;
  displayName: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  estimatedCostUsd: number;
  lastCall: Date | null;
};

type SortKey =
  | "displayName"
  | "requests"
  | "inputTokens"
  | "outputTokens"
  | "cacheTokens"
  | "estimatedCostUsd"
  | "lastCall";

type SortDir = "asc" | "desc";

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatLastCall(d: Date | null): string {
  if (!d) return "—";
  try {
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function ByUserTable({ rows }: { rows: UsageByUserRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("estimatedCostUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "displayName") {
        return a.displayName.localeCompare(b.displayName) * dir;
      }
      if (sortKey === "lastCall") {
        const aT = a.lastCall ? a.lastCall.getTime() : 0;
        const bT = b.lastCall ? b.lastCall.getTime() : 0;
        return (aT - bT) * dir;
      }
      return (a[sortKey] - b[sortKey]) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default to descending for numeric columns, ascending for name.
      setSortDir(key === "displayName" ? "asc" : "desc");
    }
  }

  if (rows.length === 0) {
    return (
      <section
        aria-label="Per-user usage"
        className="rounded-2xl border border-bone-700 bg-bone-900"
      >
        <header className="border-b border-bone-800 px-5 py-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-claude-300">
            By member
          </h2>
        </header>
        <p className="p-6 text-center text-sm italic text-bone-400">
          No events in this range yet.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Per-user usage"
      className="rounded-2xl border border-bone-700 bg-bone-900"
    >
      <header className="border-b border-bone-800 px-5 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-claude-300">
          By member
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bone-800 bg-bone-950/40">
              <SortableTh
                align="left"
                active={sortKey === "displayName"}
                dir={sortDir}
                onClick={() => toggleSort("displayName")}
              >
                Member
              </SortableTh>
              <SortableTh
                align="right"
                active={sortKey === "requests"}
                dir={sortDir}
                onClick={() => toggleSort("requests")}
              >
                Requests
              </SortableTh>
              <SortableTh
                align="right"
                active={sortKey === "inputTokens"}
                dir={sortDir}
                onClick={() => toggleSort("inputTokens")}
              >
                Input
              </SortableTh>
              <SortableTh
                align="right"
                active={sortKey === "outputTokens"}
                dir={sortDir}
                onClick={() => toggleSort("outputTokens")}
              >
                Output
              </SortableTh>
              <SortableTh
                align="right"
                active={sortKey === "cacheTokens"}
                dir={sortDir}
                onClick={() => toggleSort("cacheTokens")}
              >
                Cached
              </SortableTh>
              <SortableTh
                align="right"
                active={sortKey === "estimatedCostUsd"}
                dir={sortDir}
                onClick={() => toggleSort("estimatedCostUsd")}
              >
                Est. cost
              </SortableTh>
              <SortableTh
                align="right"
                active={sortKey === "lastCall"}
                dir={sortDir}
                onClick={() => toggleSort("lastCall")}
              >
                Last call
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              // System rows (null userId) render as a non-interactive
              // line — no drilldown target exists for unauthenticated
              // / background calls. Members are clickable (whole row
              // navigates, name cell has a real <Link> for keyboard).
              const key = row.userId ?? "__system__";
              const href = row.userId ? `/admin/usage/${row.userId}` : null;
              return (
                <tr
                  key={key}
                  onClick={
                    href
                      ? () => {
                          window.location.href = href;
                        }
                      : undefined
                  }
                  className={cn(
                    "border-b border-bone-800/50 last:border-b-0",
                    href && "cursor-pointer transition-colors hover:bg-bone-950/40",
                  )}
                >
                  <td className="px-4 py-2.5 align-middle">
                    {href ? (
                      <Link
                        href={href}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-bone-50 underline decoration-claude-500/40 underline-offset-2 hover:decoration-claude-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
                      >
                        {row.displayName}
                      </Link>
                    ) : (
                      <span className="font-medium text-bone-300">
                        {row.displayName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle tabular-nums text-bone-200">
                    {row.requests.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle tabular-nums text-bone-300">
                    {row.inputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle tabular-nums text-bone-300">
                    {row.outputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle tabular-nums text-bone-300">
                    {row.cacheTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle tabular-nums text-bone-100">
                    {formatUsd(row.estimatedCostUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle tabular-nums text-bone-400">
                    {formatLastCall(row.lastCall)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortableTh({
  children,
  align,
  active,
  dir,
  onClick,
}: {
  children: React.ReactNode;
  align: "left" | "right";
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-bone-400",
        align === "left" ? "text-left" : "text-right",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-bone-100",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-900",
          active && "text-bone-100",
        )}
      >
        <span>{children}</span>
        <span aria-hidden="true" className="text-[8px] opacity-60">
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
