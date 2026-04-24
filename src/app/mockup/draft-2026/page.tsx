import type { CSSProperties } from "react";
import DraftMockupView from "./_components/DraftMockupView";

// MLF Draft — locked type direction: Clash Display (display) + Satoshi (UI),
// both from Fontshare. Stylesheet loaded in layout.tsx.

const FONT_VARS: CSSProperties = {
  ["--font-display" as string]:
    "'Clash Display', 'Space Grotesk', system-ui, sans-serif",
  ["--font-ui" as string]:
    "'Satoshi', 'Manrope', system-ui, -apple-system, sans-serif",
};

export default function DraftMockupPage() {
  return (
    <div style={FONT_VARS}>
      <DraftMockupView />
    </div>
  );
}
