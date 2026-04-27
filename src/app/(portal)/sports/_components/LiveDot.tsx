/// Pulsing amber dot used to signal a LIVE state. Always rendered
/// alongside the literal text "LIVE" in the parent (per WCAG 1.4.1 —
/// color-only signaling is forbidden). The pulse is suppressed under
/// `prefers-reduced-motion: reduce`.
///
/// Sizing controlled by parent via Tailwind classes — pass any
/// `h-* w-*` pair via className.
export function LiveDot({ className = "h-2 w-2" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full bg-sports-amber motion-safe:animate-pulse ${className}`}
    />
  );
}
