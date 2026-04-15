import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The Lazy River Co.",
    template: "%s · The Lazy River Co.",
  },
  description: "Private portal for the MLF.",
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
