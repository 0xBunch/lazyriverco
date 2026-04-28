import "server-only";
import { assertUrlSafePublic } from "@/lib/safe-fetch";

// Shared JSON fetcher for calendar providers. SSRF-preflight via
// assertUrlSafePublic, then plain fetch — same pattern feed-poller.ts
// settled on after the 2026-04-27 ESPN incident where the manual-redirect
// wrapper hit a CDN edge case.

const FETCH_TIMEOUT_MS = 8_000;
const UA =
  "Mozilla/5.0 (compatible; LazyRiverBot/1.0; +https://lazyriver.co)";

export async function fetchJson<T>(url: string): Promise<T> {
  await assertUrlSafePublic(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`fetch ${url} → ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
