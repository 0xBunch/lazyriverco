"use client";

import { useEffect, useState } from "react";

// In-page sponsor carousel for the live draft room. Rotates every 8s
// (KB-confirmed cadence) over the active set, respects
// `prefers-reduced-motion` (no interval scheduled, single sponsor shown).
//
// Distinct from the /sports landing model in `pickSponsorForToday`
// (deterministic per-day) — the draft is a live event where visible
// rotation is part of the energy. If you're considering matching the
// landing-page cadence, talk to KB first.

const NAVY_600 = "#2A4F85";
const NAVY_700 = "#1B3A66";
const NAVY_900 = "#0B1A33";
const RED_500 = "#C8102E";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

const ROTATION_MS = 8000;

type Sponsor = { name: string; tagline: string | null };

export function SponsorCarousel({
  sponsors,
}: {
  sponsors: readonly Sponsor[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (sponsors.length <= 1) return;
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % sponsors.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [sponsors.length]);

  // Clamp in case the sponsor list shrinks underneath us (admin removed
  // one mid-draft; revalidatePath re-renders with a shorter array).
  const safeIndex = sponsors.length > 0 ? Math.min(index, sponsors.length - 1) : 0;
  const active = sponsors[safeIndex] ?? null;
  const dotCount = Math.max(sponsors.length, 1);

  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-sm border p-5"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em]">
          <span style={{ color: CREAM_400 }}>MLF Draft 2026</span>
          <span style={{ color: NAVY_600 }}>·</span>
          <span style={{ color: CREAM_200 }}>Presented By</span>
        </div>
      </div>

      {active ? (
        <>
          <div
            key={`${active.name}-${safeIndex}`}
            className="text-[20px] leading-[1] tracking-[-0.01em] md:text-[24px]"
            style={{
              fontFamily: "'Clash Display', 'Space Grotesk', system-ui, sans-serif",
              fontWeight: 700,
              color: CREAM_50,
              textTransform: "uppercase",
            }}
          >
            {active.name}
          </div>
          {active.tagline ? (
            <div
              className="text-[13px] italic leading-[1.35]"
              style={{ color: CREAM_200 }}
            >
              &ldquo;{active.tagline}&rdquo;
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-[13px] italic" style={{ color: CREAM_400 }}>
          No sponsors on rotation yet. Add some in admin.
        </div>
      )}

      <div
        className="mt-auto flex items-center gap-1.5 pt-1"
        aria-label={
          active ? `Sponsor ${safeIndex + 1} of ${dotCount}` : undefined
        }
      >
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-colors"
            style={{ backgroundColor: i === safeIndex ? RED_500 : NAVY_600 }}
          />
        ))}
      </div>
    </div>
  );
}
