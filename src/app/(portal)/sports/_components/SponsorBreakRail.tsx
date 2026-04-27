import type { SportsSponsor } from "@prisma/client";

/// Mid-page broadcast-break sponsor rail. Full-bleed (no max-width
/// constraint), sits between the WAG/MLF row and the
/// HEADLINES/HIGHLIGHTS row on the /sports landing.
///
/// Mirrors the SponsorRail pattern at
/// src/app/(portal)/sports/mlf/draft-2026/page.tsx (lines 600-660):
/// callsign label, brand name in display caps, italic tagline in
/// quotes, rotation dots showing position in the active set. Active
/// dot uses sports-amber; dim dots use bone-700 (vs draft-2026's
/// red/navy palette).
///
/// Renders nothing when there's no active sponsor.
export function SponsorBreakRail({
  sponsor,
  totalActive,
  activeIndex,
}: {
  sponsor: Pick<SportsSponsor, "name" | "tagline" | "href"> | null;
  /// Total active sponsors. Used to render the rotation dot count;
  /// minimum 1 to render the rail at all.
  totalActive: number;
  /// 0-based index of `sponsor` within the active set. Drives which
  /// dot is highlighted.
  activeIndex: number;
}) {
  if (!sponsor || totalActive <= 0) return null;

  const dotCount = Math.max(totalActive, 1);
  const safeIndex = Math.max(0, Math.min(activeIndex, dotCount - 1));

  return (
    <section
      aria-label="Sponsor break"
      className="relative w-full border-y border-sports-amber/30 bg-bone-900/50"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.06]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 50%, rgba(242,201,76,0.6) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-4 px-4 py-6 md:grid-cols-12 md:gap-6 md:px-6 md:py-8 lg:gap-10 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-2 md:col-span-7">
          <div className="flex items-center gap-2">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-sports-amber/80">
              Lazy River Sports
            </span>
            <span aria-hidden="true" className="text-bone-700">
              ·
            </span>
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-300">
              Brought to you by
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-2 md:gap-4">
            <span
              className="font-display font-bold uppercase text-bone-50"
              style={{
                fontSize: "clamp(28px, 3.6vw, 48px)",
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}
            >
              {sponsor.name}
            </span>
            {sponsor.tagline ? (
              <span className="text-sm italic text-bone-300 md:text-base">
                &ldquo;{sponsor.tagline}&rdquo;
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 md:col-span-5 md:justify-end md:gap-5">
          <div className="flex items-center gap-3">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-500">
              Rotation
            </span>
            <div
              className="flex items-center gap-1.5"
              aria-label={`Sponsor ${safeIndex + 1} of ${dotCount}`}
            >
              {Array.from({ length: dotCount }).map((_, i) => (
                <span
                  key={i}
                  className={
                    i === safeIndex
                      ? "h-1.5 w-3 rounded-full bg-sports-amber"
                      : "h-1.5 w-1.5 rounded-full bg-bone-700"
                  }
                />
              ))}
            </div>
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] tabular-nums text-bone-400">
              {String(safeIndex + 1).padStart(2, "0")} / {String(dotCount).padStart(2, "0")}
            </span>
          </div>
          {sponsor.href ? (
            <a
              href={sponsor.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-bone-700 bg-bone-950 px-4 py-2 text-xs uppercase tracking-widest text-bone-100 transition-colors hover:border-sports-amber/60 hover:text-sports-amber focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Visit
              <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
