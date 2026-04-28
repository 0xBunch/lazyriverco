"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionHeader } from "./SectionHeader";
import type { StandingsRow } from "@/lib/sleeper";

/// Full MLF standings card for the right rail. Renders every rostered
/// manager, not just top N. Tightened typography compared to the
/// retired MlfTopThree because the row count is 4× higher.
///
/// Mobile shows the top 5 with a "Show all" disclosure to keep the
/// rail short under the WAG hero. Desktop renders the full list.
const MOBILE_PREVIEW = 5;

export function MlfStandingsRail({
  data,
}: {
  data: {
    rows: StandingsRow[];
    season: string;
    currentWeek: number;
    mode: "live" | "recap";
  } | null;
}) {
  const [showAll, setShowAll] = useState(false);

  const labelSuffix = data
    ? data.mode === "recap"
      ? `· ${data.season} Recap`
      : `· Wk ${data.currentWeek}`
    : "";

  const rows = data?.rows ?? [];
  const showToggle = rows.length > MOBILE_PREVIEW;

  return (
    <section className="rounded-sm border border-bone-200 bg-bone-100 p-5 md:p-7">
      <SectionHeader
        label={`MLF · Standings ${labelSuffix}`.trim()}
        srTitle="MLF standings"
        trailing={
          <Link
            href="/sports/mlf"
            className="text-xs text-claude-700 transition-colors hover:text-claude-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
          >
            Full standings →
          </Link>
        }
      />
      {!data || rows.length === 0 ? (
        <p className="mt-5 text-sm text-bone-600">
          MLF standings unavailable right now.
        </p>
      ) : (
        <>
          <ol className="mt-5 divide-y divide-bone-200/60">
            {rows.map((row, i) => (
              <li
                key={row.rosterId}
                // Hide rows past the preview cutoff on mobile until the
                // user expands. Desktop always shows them.
                className={
                  !showAll && i >= MOBILE_PREVIEW
                    ? "hidden items-center gap-3 py-2 md:flex"
                    : "flex items-center gap-3 py-2"
                }
              >
                <span className="w-5 text-sm tabular-nums text-bone-500">
                  {row.rank}
                </span>
                <ManagerAvatar row={row} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-semibold text-bone-950">
                    {row.teamName ?? row.managerDisplayName}
                  </p>
                  {row.teamName ? (
                    <p className="truncate text-xs text-bone-600">
                      {row.managerDisplayName}
                    </p>
                  ) : null}
                </div>
                <span className="text-sm tabular-nums text-bone-900">
                  {row.wins}–{row.losses}
                  {row.ties > 0 ? `–${row.ties}` : ""}
                </span>
                <span className="ml-2 hidden text-xs tabular-nums text-bone-600 md:ml-3 md:inline">
                  {row.pointsFor.toFixed(1)}
                </span>
              </li>
            ))}
          </ol>
          {showToggle ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600 transition-colors hover:text-bone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 md:hidden"
              aria-expanded={showAll}
            >
              {showAll
                ? "Show less"
                : `Show all ${rows.length} →`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function ManagerAvatar({ row }: { row: StandingsRow }) {
  if (row.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={row.avatar}
        alt=""
        className="h-7 w-7 rounded-full object-cover ring-1 ring-bone-300"
      />
    );
  }
  const initials = (row.teamName ?? row.managerDisplayName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <div className="grid h-7 w-7 place-items-center rounded-full bg-bone-200 font-display text-[10px] font-semibold text-bone-900 ring-1 ring-bone-300">
      {initials || "—"}
    </div>
  );
}
