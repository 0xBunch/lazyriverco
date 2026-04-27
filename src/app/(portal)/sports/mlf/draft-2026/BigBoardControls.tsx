"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmLockPickButton } from "./ConfirmLockPickButton";

// BigBoard with client-side search / position-chip / sort controls.
// Replaces the previous server-only BigBoard so filter UX feels live
// (no URL round-trip per keystroke). Outer layout (margins, 2-col
// grid for the Dossier) stays in page.tsx.
//
// Filter state is component-local; clicking a player to open the
// dossier (?selected=playerId) re-renders the page and resets the
// filter. Acceptable for v0 — KB can ask for URL persistence if it
// bites.

const NAVY_700 = "#1B3A66";
const NAVY_800 = "#12294A";
const NAVY_900 = "#0B1A33";
const RED_500 = "#C8102E";
const RED_400 = "#E23A52";
const RED_900 = "#4A0914";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

const POSITIONS = ["All", "QB", "RB", "WR", "TE"] as const;
type Position = (typeof POSITIONS)[number];

const SORT_OPTIONS = [
  { key: "rank", label: "Rank" },
  { key: "name", label: "Name" },
  { key: "team", label: "NFL" },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]["key"];

export type PoolItem = {
  id: string;
  playerId: string;
  player: {
    playerId: string;
    fullName: string | null;
    position: string | null;
    team: string | null;
  };
};

type Props = {
  pool: PoolItem[];
  youreOnClock: boolean;
  isAdmin: boolean;
  onClockPickId: string | null;
  selectedPlayerId: string | null;
};

export function BigBoardControls({
  pool,
  youreOnClock,
  isAdmin,
  onClockPickId,
  selectedPlayerId,
}: Props) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position>("All");
  const [sortKey, setSortKey] = useState<SortKey>("rank");

  // Snapshot ranks so the ## column always reflects the player's true
  // ADP rank in the un-filtered pool, not their filter-relative index.
  const rankByPlayerId = useMemo(() => {
    const m = new Map<string, number>();
    pool.forEach((row, idx) => m.set(row.playerId, idx + 1));
    return m;
  }, [pool]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let result = pool;
    if (position !== "All") {
      result = result.filter((r) => r.player.position === position);
    }
    if (s) {
      result = result.filter((r) =>
        (r.player.fullName ?? r.playerId).toLowerCase().includes(s),
      );
    }
    if (sortKey === "name") {
      return [...result].sort((a, b) =>
        (a.player.fullName ?? "").localeCompare(b.player.fullName ?? ""),
      );
    }
    if (sortKey === "team") {
      return [...result].sort((a, b) =>
        (a.player.team ?? "").localeCompare(b.player.team ?? ""),
      );
    }
    // sortKey === "rank" — pool is already in rank order.
    return result;
  }, [pool, search, position, sortKey]);

  return (
    <div
      className="overflow-hidden rounded-sm border"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      {/* Top bar: title + count + admin chip */}
      <div
        className="flex flex-wrap items-center gap-3 border-b px-4 py-3 md:gap-5"
        style={{ borderColor: NAVY_700 }}
      >
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_200 }}
        >
          Big Board
        </h2>
        <span
          className="hidden h-3.5 w-px md:block"
          style={{ backgroundColor: NAVY_700 }}
        />
        <span
          className="text-[10px] font-bold uppercase tracking-[0.22em] tabular-nums"
          style={{ color: CREAM_400 }}
        >
          {filtered.length} of {pool.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {youreOnClock && (
            <span
              className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ backgroundColor: RED_900, color: RED_400 }}
            >
              Your pick
            </span>
          )}
          {isAdmin && !youreOnClock && onClockPickId && (
            <span
              className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ backgroundColor: NAVY_800, color: CREAM_200 }}
            >
              Admin · pick on-behalf
            </span>
          )}
        </div>
      </div>

      {/* Controls bar: search + position chips + sort */}
      <div
        className="flex flex-wrap items-center gap-3 border-b px-4 py-3 md:gap-4"
        style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}80` }}
      >
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          aria-label="Search Big Board"
          className="w-full rounded-sm border bg-transparent px-2.5 py-1.5 text-[12px] placeholder:text-[--ph] focus:outline-none md:w-44"
          style={
            {
              borderColor: NAVY_700,
              color: CREAM_50,
              ["--ph" as string]: CREAM_400,
            } as React.CSSProperties
          }
        />

        <div className="flex flex-wrap items-center gap-1">
          <span
            className="mr-1 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: CREAM_400 }}
          >
            Pos
          </span>
          {POSITIONS.map((p) => {
            const active = position === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPosition(p)}
                className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition hover:brightness-125 focus:outline-none"
                style={{
                  backgroundColor: active ? RED_900 : NAVY_800,
                  color: active ? RED_400 : CREAM_200,
                  boxShadow: active ? `0 0 0 1px ${RED_500}` : undefined,
                }}
                aria-pressed={active}
              >
                {p}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <span
            className="mr-1 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: CREAM_400 }}
          >
            Sort
          </span>
          {SORT_OPTIONS.map((o) => {
            const active = sortKey === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setSortKey(o.key)}
                className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition hover:brightness-125 focus:outline-none"
                style={{
                  backgroundColor: active ? RED_900 : "transparent",
                  color: active ? RED_400 : CREAM_400,
                  boxShadow: active ? `0 0 0 1px ${RED_500}` : undefined,
                }}
                aria-pressed={active}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <p className="px-4 py-6 italic text-sm" style={{ color: CREAM_400 }}>
          {pool.length === 0
            ? "Pool is empty. Seed it from the admin."
            : "No players match the current filters."}
        </p>
      ) : (
        <div>
          {filtered.map((row, idx) => (
            <PoolRow
              key={row.id}
              rank={rankByPlayerId.get(row.playerId) ?? idx + 1}
              player={row.player}
              youCanPick={(youreOnClock || isAdmin) && !!onClockPickId}
              onClockPickId={onClockPickId}
              selected={selectedPlayerId === row.playerId}
              alt={idx % 2 !== 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PoolRow({
  rank,
  player,
  youCanPick,
  onClockPickId,
  selected,
  alt,
}: {
  rank: number;
  player: PoolItem["player"];
  youCanPick: boolean;
  onClockPickId: string | null;
  selected: boolean;
  alt: boolean;
}) {
  const name = player.fullName ?? player.playerId;
  return (
    <div
      className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b px-3 py-3 text-[13px] tabular-nums transition duration-150 md:grid-cols-[40px_minmax(0,2fr)_50px_50px_140px] md:px-4 md:py-2.5 md:hover:translate-x-px"
      style={{
        borderColor: `${NAVY_700}40`,
        backgroundColor: selected
          ? `${RED_900}40`
          : alt
            ? `${NAVY_800}55`
            : "transparent",
        boxShadow: selected ? `inset 2px 0 0 ${RED_500}` : undefined,
      }}
    >
      <span className="text-[11px] md:text-[13px]" style={{ color: CREAM_400 }}>
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <Link
          href={`?selected=${encodeURIComponent(player.playerId)}`}
          scroll={false}
          className="block truncate font-semibold transition hover:brightness-125 focus:outline-none focus-visible:underline"
          style={{ color: CREAM_50 }}
        >
          {name}
        </Link>
        <div
          className="mt-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] md:hidden"
          style={{ color: CREAM_200 }}
        >
          <span>{player.position ?? "?"}</span>
          <span style={{ color: CREAM_400 }}>·</span>
          <span>{player.team ?? "FA"}</span>
        </div>
      </div>
      <span className="hidden font-semibold md:inline" style={{ color: CREAM_200 }}>
        {player.position ?? "?"}
      </span>
      <span className="hidden font-semibold md:inline" style={{ color: CREAM_200 }}>
        {player.team ?? "FA"}
      </span>
      <div className="flex items-center justify-end">
        {youCanPick && onClockPickId ? (
          <ConfirmLockPickButton
            pickId={onClockPickId}
            playerId={player.playerId}
            playerName={name}
            position={player.position}
            team={player.team}
          />
        ) : (
          <span style={{ color: CREAM_400, fontSize: 11 }}>→</span>
        )}
      </div>
    </div>
  );
}
