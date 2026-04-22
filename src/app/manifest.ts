import type { MetadataRoute } from "next";

// Web Share Target API — lets an installed PWA appear in iOS/Android
// share sheets. When a user hits Share → Lazy River on any page, the
// browser navigates to `action` with the shared payload in the query
// params, and our /library/share handler ingests it.
//
// Next.js 14's MetadataRoute.Manifest types `share_target.params` as an
// array of `{ name, value }` objects, but the WebAppManifest spec — and
// every browser that actually implements share_target — expects an
// object mapping Web Share data keys (url, title, text) to the GET
// parameter names. Next just JSON-serializes the return value, so we
// cast here to emit the spec-correct shape. See
// https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target.
const SHARE_TARGET = {
  action: "/library/share",
  method: "get",
  params: {
    url: "url",
    title: "title",
    text: "text",
  },
} as unknown as MetadataRoute.Manifest["share_target"];

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Lazy River Co.",
    short_name: "Lazy River",
    description: "Corporate extranet of the Lazy River Corporation, a subsidiary of Mens League.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#141311",
    theme_color: "#141311",
    share_target: SHARE_TARGET,
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
