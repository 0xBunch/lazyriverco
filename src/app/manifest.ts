import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Lazy River Co.",
    short_name: "Lazy River",
    description: "Corporate extranet of the Lazy River Corporation, a subsidiary of Mens League.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#141311",
    theme_color: "#141311",
    // Install icons for macOS Dock / Chrome PWA. Chrome wraps installed
    // web apps in a rounded container; declaring "maskable" tells it to
    // fill that container edge-to-edge instead of framing our icon in
    // white. The source PNGs are full-bleed (no baked-in rounded corners,
    // no transparent padding) — the OS container shape supplies the
    // squircle. The "any" fallback points at /icon.png (the Next.js
    // file-based favicon at src/app/icon.png) which does keep baked-in
    // rounded corners, for browsers that don't mask.
    // Source: MDN — Define your app icons; Chromium maskable-icon guidance.
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.png",
        sizes: "436x436",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
