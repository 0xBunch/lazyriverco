import type { Metadata } from "next";

// The public draft page uses the same Fontshare families the mockup
// locked in (Clash Display + Satoshi). Loading them at layout scope
// means the skeleton / setup / paused / live / complete states all get
// the same typographic treatment without touching the root layout.

export const metadata: Metadata = {
  title: "MLF Rookie Draft 2026",
};

const FONTSHARE_HREF =
  "https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700,900&display=swap";

export default function DraftRouteLayout({
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
