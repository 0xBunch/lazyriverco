import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Lazy River Co.",
  description: "Private portal for the MLF",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
