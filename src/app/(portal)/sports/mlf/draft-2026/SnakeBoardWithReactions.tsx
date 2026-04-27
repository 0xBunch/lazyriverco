"use client";

import { useEffect, useId, useState } from "react";
import { FocusTrap } from "@/components/FocusTrap";

// Snake-grid Draft Board with click-to-expand AI-reaction popovers.
//
// Replaces the previous server-only DraftBoard + the standalone
// ReactionsFeed. Each locked cell that has a reaction becomes a
// clickable button; click → popover anchored below the cell with the
// reaction body. One popover open at a time. Closes on Escape,
// outside-click, or second click on the same cell.
//
// State lives at the board level so opening a second cell auto-closes
// the first. An "unread" indicator (small red dot) shows on cells the
// user hasn't opened in this session — resets per page load, which is
// fine: it nudges users to read each reaction at least once but
// doesn't pretend to be persistent state.
//
// SR-only fallback: a hidden linear list at the end of the board so
// screen-reader users can skim every reaction without clicking each
// cell. Mirrors the affordance the deleted bottom feed used to provide.

const NAVY_700 = "#1B3A66";
const NAVY_800 = "#12294A";
const NAVY_900 = "#0B1A33";
const RED_500 = "#C8102E";
const RED_400 = "#E23A52";
const RED_900 = "#4A0914";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

export type SnakePick = {
  id: string;
  round: number;
  pickInRound: number;
  status: string;
  player: { fullName: string | null; team: string | null } | null;
  reaction: { body: string } | null;
  slot: {
    user: { displayName: string };
  };
};

export function SnakeBoardWithReactions({
  picks,
  totalSlots,
}: {
  picks: readonly SnakePick[];
  totalSlots: number;
}) {
  const [openPickId, setOpenPickId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  // Outside-click close. Cells and popovers tag themselves with data-*
  // attributes so we can scope the "is the click outside?" check to
  // anything that isn't a snake cell or popover.
  useEffect(() => {
    if (!openPickId) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-snake-cell]")) return;
      if (target.closest("[data-snake-popover]")) return;
      setOpenPickId(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openPickId]);

  if (picks.length === 0) return null;

  const byRound = new Map<number, SnakePick[]>();
  for (const p of picks) {
    const list = byRound.get(p.round) ?? [];
    list.push(p);
    byRound.set(p.round, list);
  }

  const handleToggle = (pickId: string) => {
    setOpenPickId((cur) => (cur === pickId ? null : pickId));
    setReadIds((cur) => {
      if (cur.has(pickId)) return cur;
      const next = new Set(cur);
      next.add(pickId);
      return next;
    });
  };

  const handleClose = () => setOpenPickId(null);

  const reactionsForSr = picks
    .filter((p) => p.status === "locked" && p.reaction?.body && p.player?.fullName)
    .sort((a, b) => a.round - b.round || a.pickInRound - b.pickInRound);

  return (
    <section className="px-4 pb-8 md:px-8">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_200 }}
        >
          Draft Board
        </h2>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_400 }}
        >
          · Snake · 3 rounds × {totalSlots} managers
        </span>
        <span
          className="ml-auto text-[9px] font-semibold italic md:hidden"
          style={{ color: CREAM_400 }}
        >
          swipe to see all picks →
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {[...byRound.entries()]
          .sort(([a], [b]) => a - b)
          .map(([round, rp]) => (
            <div
              key={round}
              className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:overflow-visible md:px-0 md:pb-0"
            >
              <div
                className="grid gap-2 md:gap-2"
                style={{
                  gridTemplateColumns: `repeat(${rp.length}, minmax(96px, 1fr))`,
                }}
              >
                {rp
                  .sort((a, b) => a.pickInRound - b.pickInRound)
                  .map((p) => (
                    <SnakeCell
                      key={p.id}
                      pick={p}
                      open={openPickId === p.id}
                      unread={
                        !readIds.has(p.id) &&
                        p.status === "locked" &&
                        !!p.reaction?.body
                      }
                      onToggle={() => handleToggle(p.id)}
                      onClose={handleClose}
                    />
                  ))}
              </div>
            </div>
          ))}
      </div>

      {reactionsForSr.length > 0 && (
        <div className="sr-only" aria-live="polite">
          <h3>All pick reactions</h3>
          <ul>
            {reactionsForSr.map((p) => (
              <li key={p.id}>
                Pick {p.round}.{String(p.pickInRound).padStart(2, "0")} —{" "}
                {p.slot.user.displayName} took {p.player?.fullName}
                {p.player?.team ? `, ${p.player.team}` : ""}: {p.reaction?.body}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SnakeCell({
  pick,
  open,
  unread,
  onToggle,
  onClose,
}: {
  pick: SnakePick;
  open: boolean;
  unread: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const popoverId = useId();
  const isCurrent = pick.status === "onClock";
  const isTaken = pick.status === "locked";
  const hasReaction = isTaken && !!pick.reaction?.body;

  const bg = isCurrent ? `${RED_900}99` : isTaken ? NAVY_800 : `${NAVY_900}80`;
  const border = isCurrent ? RED_500 : NAVY_700;

  const inner = (
    <>
      <div className="flex items-baseline gap-2">
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 12,
            color: isCurrent ? RED_400 : CREAM_400,
            letterSpacing: "0.04em",
          }}
        >
          {pick.round}.{String(pick.pickInRound).padStart(2, "0")}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: isCurrent ? RED_400 : CREAM_200 }}
        >
          {pick.slot.user.displayName}
        </span>
      </div>
      {isCurrent ? (
        <span
          className="text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ color: RED_400 }}
        >
          ◉ On the clock
        </span>
      ) : isTaken && pick.player?.fullName ? (
        <span
          className="leading-tight"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: CREAM_50,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          {pick.player.fullName}
        </span>
      ) : (
        <span style={{ color: CREAM_400, fontSize: 12 }}>—</span>
      )}
    </>
  );

  // Non-interactive: pending cells, on-clock cell, locked-without-reaction.
  if (!hasReaction) {
    return (
      <div
        data-snake-cell
        className="relative flex min-h-[64px] flex-col gap-1 rounded-sm border px-3 py-2.5"
        style={{
          backgroundColor: bg,
          borderColor: border,
          boxShadow: isCurrent ? `0 0 0 1px ${RED_900}` : undefined,
        }}
      >
        {inner}
      </div>
    );
  }

  return (
    <div data-snake-cell className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        className="relative flex min-h-[64px] w-full flex-col gap-1 rounded-sm border px-3 py-2.5 text-left transition hover:brightness-110 focus:outline-none"
        style={{
          backgroundColor: bg,
          borderColor: open ? RED_400 : border,
          boxShadow: open
            ? `0 0 0 1px ${RED_500}`
            : `inset 0 0 0 0 transparent`,
          cursor: "pointer",
        }}
      >
        {inner}
        {unread && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: RED_500 }}
          />
        )}
      </button>
      {open && (
        <div
          id={popoverId}
          data-snake-popover
          className="absolute left-1/2 top-full z-50 mt-2 w-[min(280px,90vw)] -translate-x-1/2"
        >
          <FocusTrap
            role="dialog"
            aria-label={`Reaction for pick ${pick.round}.${String(pick.pickInRound).padStart(2, "0")}`}
            className="relative rounded-sm border p-3 focus:outline-none"
            style={{
              borderColor: RED_500,
              backgroundColor: NAVY_900,
              boxShadow: `0 12px 30px rgba(0,0,0,0.55), inset 0 0 0 1px ${RED_900}`,
            }}
            onEscape={onClose}
          >
            <span
              aria-hidden
              className="absolute -top-1.5 left-1/2 block h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t"
              style={{ borderColor: RED_500, backgroundColor: NAVY_900 }}
            />
            <header className="relative mb-2 flex items-baseline justify-between gap-2">
              <span
                className="text-[10px] font-bold uppercase tracking-[0.22em]"
                style={{ color: RED_400 }}
              >
                Pick {pick.round}.{String(pick.pickInRound).padStart(2, "0")} ·{" "}
                {pick.slot.user.displayName}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close reaction"
                className="-m-1 px-1 text-[12px] focus:outline-none"
                style={{ color: CREAM_400 }}
              >
                ✕
              </button>
            </header>
            {pick.player?.fullName && (
              <p
                className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: CREAM_200 }}
              >
                {pick.player.fullName}
                {pick.player.team ? ` · ${pick.player.team}` : ""}
              </p>
            )}
            <p
              className="text-[12px] leading-[1.5]"
              style={{ color: CREAM_50 }}
            >
              {pick.reaction?.body}
            </p>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
