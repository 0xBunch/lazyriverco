import Link from "next/link";
import { SectionHeader } from "./SectionHeader";
import type { StandingsRow } from "@/lib/sleeper";

/// Compact MLF standings strip — top N managers (default 3). Renders
/// in the right rail of the /sports landing on desktop, stacked above
/// TONIGHT. Mobile: same content, no W-L on the very narrowest layouts
/// (handled here via `hidden md:inline` on the record).
///
/// Reuses StandingsRow from src/lib/sleeper.ts. The avatar field is a
/// URL when Sleeper has a manager avatar uploaded, otherwise null —
/// fall back to initials in a colored circle.
export function MlfTopThree({
  data,
}: {
  data: {
    rows: StandingsRow[];
    season: string;
    currentWeek: number;
    mode: "live" | "recap";
  } | null;
}) {
  const labelSuffix = data
    ? data.mode === "recap"
      ? `· ${data.season} Recap`
      : `· Wk ${data.currentWeek}`
    : "";

  return (
    <section className="rounded-sm border border-bone-800 bg-bone-900/40 p-5 md:p-7">
      <SectionHeader
        label={`MLF · Top 3 ${labelSuffix}`.trim()}
        srTitle="MLF Top 3 standings"
        trailing={
          <Link
            href="/sports/mlf"
            className="text-xs text-claude-300 transition-colors hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
          >
            Full standings →
          </Link>
        }
      />
      {!data || data.rows.length === 0 ? (
        <p className="mt-5 text-sm text-bone-400">
          MLF standings unavailable right now.
        </p>
      ) : (
        <ol className="mt-5 divide-y divide-bone-800">
          {data.rows.map((row) => (
            <li key={row.rosterId} className="flex items-center gap-3 py-3 md:gap-4">
              <span className="w-5 font-display text-xl font-semibold tabular-nums text-bone-400 md:w-6 md:text-2xl">
                {row.rank}
              </span>
              <ManagerAvatar row={row} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-bone-50 md:text-base">
                  {row.teamName ?? row.managerDisplayName}
                </p>
                {row.teamName ? (
                  <p className="truncate text-xs text-bone-400">
                    {row.managerDisplayName}
                  </p>
                ) : null}
              </div>
              <span className="text-sm tabular-nums text-bone-100">
                {row.wins}–{row.losses}
                {row.ties > 0 ? `–${row.ties}` : ""}
              </span>
              <span className="ml-2 hidden text-xs tabular-nums text-bone-400 md:ml-3 md:inline">
                {row.pointsFor.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
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
        className="h-8 w-8 rounded-full object-cover ring-1 ring-bone-700 md:h-9 md:w-9"
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
    <div className="grid h-8 w-8 place-items-center rounded-full bg-bone-800 font-display text-xs font-semibold text-bone-100 ring-1 ring-bone-700 md:h-9 md:w-9">
      {initials || "—"}
    </div>
  );
}
