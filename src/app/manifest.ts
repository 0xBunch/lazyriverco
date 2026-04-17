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
    // Install icons carry ~10% transparent padding so the PWA renders at
    // native Dock/Launchpad sizing (macOS applies no additional padding to
    // PWA icons, unlike native .icns bundles which bake in ~10%). Without
    // the padding our icon looked ~1.1× the size of native apps next to it.
    // Source: docs/MDN on defining PWA icons + Chromium maskable-icon
    // guidance. Maskable variant for macOS Sonoma+ squircle masking is a
    // v2 follow-up — requires content inside an 80% safe zone with a
    // full-bleed (no rounded corners) background.
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
