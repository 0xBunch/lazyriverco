/// Section header used across the /sports landing modules. Combines:
///
///   - A real <h2 className="sr-only"> carrying the heading for screen
///     readers (so the document outline is meaningful).
///   - A visible call-letter label (uppercase, tracked-wide, small)
///     marked aria-hidden — it's visual ornament, not the heading.
///   - An optional trailing slot for a "More →" link or filter chip.
///
/// Visual: font-display uppercase tracking-[0.28em] text-[10px]
/// font-semibold text-bone-600. Per the rams a11y pass, decorative
/// labels under WCAG's 12pt advisory must not be the only heading.
export function SectionHeader({
  label,
  srTitle,
  trailing,
}: {
  /// Visual call-letter text. Example: "MLF · Top 3 · Wk 8".
  label: string;
  /// The real heading text for screen readers. Example: "MLF Top 3".
  srTitle: string;
  /// Optional trailing element (e.g. "Full standings →" link).
  trailing?: React.ReactNode;
}) {
  return (
    <header className="flex items-baseline justify-between">
      <h2 className="sr-only">{srTitle}</h2>
      <span
        aria-hidden="true"
        className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600"
      >
        {label}
      </span>
      {trailing}
    </header>
  );
}
