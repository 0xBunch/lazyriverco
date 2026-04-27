// /sports — load the Fontshare families used by the MLF Draft surface
// (Clash Display + Satoshi) at this scope so the MlfDraftBanner in the
// right rail has type to render. Mirrors the nested draft-2026/layout.tsx
// pattern; identical <link href> values dedupe across navigations.

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
      {children}
    </>
  );
}
