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
      {children}
    </>
  );
}
