"use client";

import { useEffect, useRef, useState } from "react";

// Broadcast-chyron sponsor ticker above the footer. Diegetic — reads as
// part of the broadcast booth ("Presented by …") rather than a web ad
// banner. Two render modes:
//
//   - TEXT mode (sponsor.imageUrl is null): "PRESENTED BY · BRAND ·
//     'tagline'" single-line layout. The default until an admin (or
//     the ad-gen tool) populates DraftSponsor.imageR2Key.
//   - IMAGE mode (sponsor.imageUrl set): the image fills the slab as a
//     full-bleed background; chrome (controls) overlays the top-right.
//     Eyebrow text drops out — the image IS the brand statement; the
//     section's aria-label + image alt carry semantics for AT.
//
// Either mode may carry a sponsor.linkUrl. When set, the brand area
// (image OR text content) is wrapped in <a target="_blank" rel="noopener
// noreferrer"> with sr-only "(opens in new tab)" text. Controls stay
// outside the link so the pause button is always interactive.
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
const NAVY_950 = "#070E20";
const RED_400 = "#E23A52";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

const ROTATION_MS = 10_000;
const FADE_MS = 200;

type Sponsor = {
  name: string;
  tagline: string | null;
  /** Resolved public URL (R2_BASE + imageR2Key) — caller assembles so
   *  this client component doesn't need the env var. Null = text mode. */
  imageUrl: string | null;
  linkUrl: string | null;
};

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
  const hasImage = !!active.imageUrl;
  const altText = active.tagline ? `${active.name} — ${active.tagline}` : active.name;
  const linkSrLabel = `${altText} (opens in new tab)`;

  return (
    <section
      ref={containerRef}
      aria-label={`Sponsor: ${active.name}`}
      className="relative flex h-10 items-center gap-3 overflow-hidden border-t px-4 md:h-12 md:gap-4 md:px-8"
      style={{
        borderColor: NAVY_700,
        backgroundColor: `${NAVY_900}E6`,
      }}
    >
      {hasImage ? (
        active.linkUrl ? (
          <a
            href={active.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 z-0 block focus:outline-none"
            aria-label={linkSrLabel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`img-${safeIndex}-${active.imageUrl}`}
              src={active.imageUrl!}
              alt=""
              aria-hidden
              className="h-full w-full object-cover transition-opacity"
              style={{ transitionDuration: `${FADE_MS}ms` }}
            />
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`img-${safeIndex}-${active.imageUrl}`}
            src={active.imageUrl!}
            alt={altText}
            className="absolute inset-0 z-0 h-full w-full object-cover transition-opacity"
            style={{ transitionDuration: `${FADE_MS}ms` }}
          />
        )
      ) : (
        <>
          <span
            className="relative z-10 shrink-0 text-[9px] font-bold uppercase tracking-[0.26em]"
            style={{ color: CREAM_400 }}
          >
            Presented by
          </span>

          <span
            aria-hidden
            className="relative z-10 hidden h-4 w-px md:block"
            style={{ backgroundColor: NAVY_700 }}
          />

          {active.linkUrl ? (
            <a
              href={active.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              key={`txt-${safeIndex}-${active.name}`}
              className="relative z-10 flex min-w-0 flex-1 items-baseline gap-2 truncate transition-opacity hover:brightness-110 focus:outline-none"
              style={{ transitionDuration: `${FADE_MS}ms` }}
              aria-label={linkSrLabel}
            >
              <TextBrand active={active} />
            </a>
          ) : (
            <span
              key={`txt-${safeIndex}-${active.name}`}
              className="relative z-10 flex min-w-0 flex-1 items-baseline gap-2 truncate transition-opacity"
              style={{ transitionDuration: `${FADE_MS}ms` }}
              aria-live="polite"
            >
              <TextBrand active={active} />
            </span>
          )}
        </>
      )}

      {hasImage && <div className="relative z-10 flex-1" />}

      {showControls && (
        <div
          className="relative z-10 flex shrink-0 items-center gap-2 rounded-sm"
          style={
            hasImage
              ? {
                  backgroundColor: `${NAVY_950}CC`,
                  padding: "2px 6px",
                  backdropFilter: "blur(2px)",
                }
              : undefined
          }
        >
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

function TextBrand({ active }: { active: Sponsor }) {
  return (
    <>
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
    </>
  );
}
