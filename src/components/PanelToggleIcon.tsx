type Variant = "open" | "close" | "expand";

// Shared panel-toggle glyph used by every nav toggle (mobile trigger,
// in-drawer close, desktop collapse). Same family as claude.ai's nav
// icon: a rounded rectangle with a vertical divider line. The divider's
// x position encodes direction — `expand` pushes it to the right (x=15)
// to hint "open me to reveal content on the right"; `open` and `close`
// share the left-side divider (x=9) because the user's mental model is
// the same: "there's a panel that lives to the left."
export function PanelToggleIcon({
  variant,
  className,
}: {
  variant: Variant;
  className?: string;
}) {
  const dividerX = variant === "expand" ? 15 : 9;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1={dividerX} y1="3" x2={dividerX} y2="21" />
    </svg>
  );
}
