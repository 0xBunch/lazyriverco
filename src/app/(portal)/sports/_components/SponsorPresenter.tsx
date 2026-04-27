import type { SportsSponsor } from "@prisma/client";

/// Inline "Presented By [Brand]" line shown in the hero meta strip.
/// Renders nothing when there's no active sponsor — the rest of the
/// meta strip flows around the absence cleanly.
///
/// Mirrors the SponsorRail pattern from
/// src/app/(portal)/sports/mlf/draft-2026/page.tsx (lines 600-660),
/// but tuned for an inline meta-strip presentation rather than a
/// dedicated card. The full broadcast-break card variant lives in
/// SponsorBreakRail.
export function SponsorPresenter({
  sponsor,
}: {
  sponsor: Pick<SportsSponsor, "name"> | null;
}) {
  if (!sponsor) return null;
  return (
    <div className="flex items-center gap-2 md:gap-3">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-500">
        Presented By
      </span>
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-50">
        {sponsor.name}
      </span>
      <span aria-hidden="true" className="hidden text-bone-700 md:inline">
        ·
      </span>
    </div>
  );
}
