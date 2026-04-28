// /sports — load the Fontshare families used by the MLF Draft surface
// (Clash Display + Satoshi) at this scope so the MlfDraftBanner in the
// right rail has type to render. Mirrors the nested draft-2026/layout.tsx
// pattern; identical <link href> values dedupe across navigations.
//
// MlsnHeaderBar lives here, NOT in (portal)/layout.tsx, so it sits
// inside the main content column (right of the dark sidebar) rather
// than spanning the full viewport. Section chrome stays within the
// canvas — sidebar and bar are visually distinct surfaces, not a
// shared top bar.
//
// Light-theme surface: /sports/* runs on bone-50 (near-white) with
// bone-900 default text — broadcast/network chrome, closer to ESPN —
// while the rest of the portal stays on the dark bone-950 body. The
// red bar above + dark sidebar to the left are intentionally distinct
// from the light content canvas: three regions, three palettes.

import { MlsnHeaderBar } from "@/components/sports/MlsnHeaderBar";

const FONTSHARE_HREF =
  "https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700,900&display=swap";

export default function SportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://api.fontshare.com" />
      <link rel="stylesheet" href={FONTSHARE_HREF} />
      <MlsnHeaderBar />
      <div className="min-h-screen bg-bone-50 text-bone-900">{children}</div>
    </>
  );
}
