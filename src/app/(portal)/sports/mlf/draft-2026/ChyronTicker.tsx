"use client";

import { useEffect, useRef, useState } from "react";

// Broadcast-chyron sponsor ticker above the footer. Diegetic — reads as
// part of the broadcast booth ("Presented by …") rather than a web ad
// banner. Text-only this round; image mode arrives in a follow-up once
// the parallel ad-gen tool ships and DraftSponsor.imageR2Key gets
// populated.
//
// Rotation:
//   - Multiple active sponsors: 10s cycle with 200ms opacity crossfade.
//   - Single sponsor: static, no interval, no pause control.
//   - prefers-reduced-motion: no interval; first sponsor static.
//   - Pause toggle button on the right (a11y / WCAG 2.2.2).
//   - Auto-pauses on focus-within so keyboard users aren't fighting
//     a moving target while reading. Resumes on focus exit.

const NAVY_700 = "#1B3A66";
const NAVY_900 = "#0B1A33";
const RED_400 = "#E23A52";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

const ROTATION_MS = 10_000;
const FADE_MS = 200;

type Sponsor = { name: string; tagline: string | null };

export function ChyronTicker({ sponsors }: { sponsors: readonly Sponsor[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false); // user-toggled
  const [focusPaused, setFocusPaused] = useState(false); // auto: focus-within
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  // Detect reduced-motion preference once on mount; respond to changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // focus-within auto-pause via native focusin/focusout. React onFocus /
  // onBlur bubble subtly differently across browsers for nested elements;
  // raw listeners on the container avoid those edge cases.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onIn = () => setFocusPaused(true);
    const onOut = (e: FocusEvent) => {
      // Only un-pause when focus leaves the chyron entirely (next focus
      // target is outside the container).
      const next = e.relatedTarget as Node | null;
      if (next && node.contains(next)) return;
      setFocusPaused(false);
    };
    node.addEventListener("focusin", onIn);
    node.addEventListener("focusout", onOut);
    return () => {
      node.removeEventListener("focusin", onIn);
      node.removeEventListener("focusout", onOut);
    };
  }, []);

  // Rotation interval. Skips when there's nothing to rotate, when the
  // user paused, when focus is inside, or when reduced-motion is on.
  useEffect(() => {
    if (sponsors.length <= 1) return;
    if (paused || focusPaused || reducedMotion) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % sponsors.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [sponsors.length, paused, focusPaused, reducedMotion]);

  // Clamp if the active sponsor list shrinks underneath us.
  const safeIndex =
    sponsors.length > 0 ? Math.min(index, sponsors.length - 1) : 0;
  const active = sponsors[safeIndex] ?? null;
  if (!active) return null;

  const showControls = sponsors.length > 1;

  return (
    <section
      ref={containerRef}
      aria-label="Sponsor"
      className="relative flex h-10 items-center gap-3 overflow-hidden border-t px-4 md:h-12 md:gap-4 md:px-8"
      style={{
        borderColor: NAVY_700,
        backgroundColor: `${NAVY_900}E6`,
      }}
    >
      <span
        className="shrink-0 text-[9px] font-bold uppercase tracking-[0.26em]"
        style={{ color: CREAM_400 }}
      >
        Presented by
      </span>

      <span
        aria-hidden
        className="hidden h-4 w-px md:block"
        style={{ backgroundColor: NAVY_700 }}
      />

      <span
        key={active.name + safeIndex}
        className="flex min-w-0 flex-1 items-baseline gap-2 truncate transition-opacity"
        style={{ transitionDuration: `${FADE_MS}ms` }}
        aria-live="polite"
      >
        <span
          className="truncate text-[13px] uppercase tracking-[-0.005em] md:text-[15px]"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            color: CREAM_50,
          }}
        >
          {active.name}
        </span>
        {active.tagline ? (
          <span
            className="hidden truncate text-[12px] italic md:inline"
            style={{ color: CREAM_200 }}
          >
            &ldquo;{active.tagline}&rdquo;
          </span>
        ) : null}
      </span>

      {showControls && (
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="hidden text-[9px] font-bold uppercase tracking-[0.22em] tabular-nums md:inline"
            style={{ color: CREAM_400 }}
          >
            {String(safeIndex + 1).padStart(2, "0")} /{" "}
            {String(sponsors.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            aria-label={paused ? "Resume sponsor rotation" : "Pause sponsor rotation"}
            aria-pressed={paused}
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm border text-[10px] focus:outline-none focus-visible:ring-2"
            style={{
              borderColor: NAVY_700,
              color: paused ? RED_400 : CREAM_200,
              backgroundColor: paused ? `${NAVY_900}` : "transparent",
            }}
          >
            {paused ? "▶" : "❚❚"}
          </button>
        </div>
      )}
    </section>
  );
}
