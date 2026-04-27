import "server-only";
import * as cheerio from "cheerio";
import { assertUrlSafePublic } from "@/lib/safe-fetch";

// Reusable OG-image scrape. Mirrors the logic in src/lib/ingest/index.ts
// (the share-target / library ingest path) but exposed as a tiny helper
// for the feed poller to enrich NewsItem rows whose RSS doesn't carry
// a media:thumbnail. Lesson 2026-04-27: search KB's existing patterns
// first — this is the second caller of the same shape, so it earns its
// own home rather than duplicating the cheerio block.
//
// Plain fetch (not the redirect:manual + cache:no-store wrapper from
// safeFetch) per the same lesson — that combination silent-blocked at
// CloudFront. SSRF preserved via assertUrlSafePublic preflight.

const FETCH_TIMEOUT_MS = 6_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const UA =
  "Mozilla/5.0 (compatible; LazyRiverBot/1.0; +https://lazyriver.co)";

/**
 * Fetch an article URL and pull the OG image. Returns null on any
 * failure — caller leaves the existing ogImageUrl untouched.
 *
 * Tolerates: non-2xx, non-HTML content-type, oversize HTML, parse
 * errors, missing meta tags. Never throws.
 */
export async function fetchOgImage(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = await assertUrlSafePublic(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("html")) return null;

    const html = await res.text();
    if (html.length === 0 || html.length > MAX_HTML_BYTES) return null;

    const $ = cheerio.load(html);
    const og =
      $('meta[property="og:image"]').attr("content")?.trim() ||
      $('meta[name="twitter:image"]').attr("content")?.trim() ||
      $('meta[name="twitter:image:src"]').attr("content")?.trim() ||
      null;

    if (!og) return null;

    // Resolve relative URLs against the article URL so callers don't
    // store half-formed values.
    try {
      return new URL(og, url).toString();
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
