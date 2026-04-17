import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// General Sans from Fontshare. Warmer humanist sans than DM Sans — closer
// in feel to Claude's proprietary Anthropic Sans without licensing it.
// Files are self-hosted under src/app/fonts/ so there is no external CDN
// hop on first paint.
const sans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./fonts/general-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/general-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/general-sans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/general-sans-700.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "The Lazy River Co.",
    template: "%s · The Lazy River Co.",
  },
  description: "Corporate extranet of the Lazy River Corporation, a subsidiary of Mens League.",
  applicationName: "The Lazy River Co.",
  appleWebApp: {
    title: "Lazy River",
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

// Next 14.2 requires viewport/themeColor to live in a dedicated export, not
// inside `metadata`. Both bone-950 backgrounds (chrome + status bar) match so
// iOS home-screen launches feel seamless.
export const viewport: Viewport = {
  themeColor: "#141311",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="bg-bone-950 font-sans text-bone-50 antialiased">
        {children}
      </body>
    </html>
  );
}
