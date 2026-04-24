import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MLF Draft 2026 — mockup",
};

// Fontshare loads Clash Display + Satoshi (the locked type direction).
const FONTSHARE_HREF =
  "https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700,900&display=swap";

export default function MockupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://api.fontshare.com" />
      <link rel="stylesheet" href={FONTSHARE_HREF} />
      {children}
    </>
  );
}
