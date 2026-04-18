import "server-only";
import * as cheerio from "cheerio";
import { copyRemoteToR2 } from "@/lib/r2";
import { safeFetch, UnsafeUrlError } from "@/lib/safe-fetch";

// Library URL ingestion. Paste a YouTube / X / Instagram / generic web URL;
// an adapter resolves it into a Media row-shaped payload we persist. One
// file on purpose — the architecture-strategist review pushed back on a
// 5-file split until we have a second caller. Dispatch is hostname-based.
//
// Failure philosophy: adapters prefer a degraded-but-working result over
// hard-failing. If we can't copy a thumbnail to R2 we keep the remote URL;
// if we can't scrape an OG image we render a typographic Tier-C card on
// the grid instead of rejecting the paste.
//
// TikTok is rejected at dispatch. The design and product leads both said
// "don't half-support it" — a raw TikTok URL in a pretty grid is a
// broken promise; refusing cleanly is kinder. Add an adapter when we
// care enough to do it right.
//
// Security surface: originTitle / originAuthor scraped here are ATTACKER-
// INFLUENCED strings (anyone can host a page with `<meta og:title="...">`).
// They must be sanitized before any LLM injection — see src/lib/media-
// context.ts. This module itself does no sanitization; it's the storage-
// shape layer only.

export type IngestOrigin = "INSTAGRAM" | "YOUTUBE" | "X" | "WEB";

export type IngestResult = {
  origin: IngestOrigin;
  sourceUrl: string;
  /** Primary display URL — R2 if localized, else remote OG/thumb, else sourceUrl. */
  url: string;
  /** Remote OG / thumbnail URL (pre-localize fallback). Null when none found. */
  ogImageUrl: string | null;
  /** Cached iframe HTML for X (tweet embed). Null for origins that don't embed. */
  embedHtml: string | null;
  originTitle: string | null;
  originAuthor: string | null;
  /** Legacy `type` free-string kept for render-site compatibility (calendar galleries). */
  mediaType: "image" | "youtube" | "tweet" | "instagram" | "link";
  storedLocally: boolean;
  /** Default mimeType for the Media row when no direct upload happened. */
  mimeType: string | null;
};

export class IngestError extends Error {
  readonly code:
    | "INVALID_URL"
    | "TIKTOK_UNSUPPORTED"
    | "FETCH_FAILED"
    | "NO_PREVIEW";
  constructor(code: IngestError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "IngestError";
  }
}

const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const UA = "LazyRiverBot/1.0 (+https://lazyriver.co)";

// ---------------------------------------------------------------------------
// Entry point

export async function ingestUrl(raw: string): Promise<IngestResult> {
  const url = safeParseUrl(raw);
  if (!url) {
    throw new IngestError("INVALID_URL", "That doesn't look like a valid URL.");
  }
  const host = url.hostname.toLowerCase();

  if (isTikTok(host)) {
    throw new IngestError(
      "TIKTOK_UNSUPPORTED",
      "TikTok isn't supported yet. Try YouTube, Instagram, or X.",
    );
  }
  if (isYouTube(host)) return ingestYouTube(url);
  if (isX(host)) return ingestX(url);
  if (isInstagram(host)) return ingestInstagram(url);
  return ingestGeneric(url);
}

// ---------------------------------------------------------------------------
// Host detection

function isYouTube(h: string) {
  return /(^|\.)youtube\.com$/.test(h) || h === "youtu.be";
}
function isX(h: string) {
  return /(^|\.)(twitter|x)\.com$/.test(h);
}
function isInstagram(h: string) {
  return /(^|\.)instagram\.com$/.test(h);
}
function isTikTok(h: string) {
  return /(^|\.)tiktok\.com$/.test(h);
}

function safeParseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// YouTube

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function extractYouTubeId(u: URL): string | null {
  if (u.hostname === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return YT_ID_RE.test(id) ? id : null;
  }
  if (u.pathname === "/watch") {
    const id = u.searchParams.get("v");
    return id && YT_ID_RE.test(id) ? id : null;
  }
  const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/);
  if (shorts) return shorts[1];
  const embed = u.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})/);
  if (embed) return embed[1];
  return null;
}

async function ingestYouTube(url: URL): Promise<IngestResult> {
  const id = extractYouTubeId(url);
  if (!id) {
    throw new IngestError(
      "INVALID_URL",
      "Couldn't parse a YouTube video ID from that link.",
    );
  }

  // maxresdefault isn't always present — 0.jpg is the universal fallback.
  const thumbUrl = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  const copied = await tryCopy(thumbUrl, "image/jpeg");

  const oe = await fetchJsonSafely(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`,
  );
  const originTitle = stringField(oe, "title");
  const originAuthor = stringField(oe, "author_name");

  const canonical = `https://www.youtube.com/watch?v=${id}`;
  const embedHtml = `<iframe src="https://www.youtube.com/embed/${id}" title="${escapeHtml(originTitle ?? "YouTube video")}" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;

  return {
    origin: "YOUTUBE",
    sourceUrl: canonical,
    url: copied?.publicUrl ?? thumbUrl,
    ogImageUrl: thumbUrl,
    embedHtml,
    originTitle,
    originAuthor,
    mediaType: "youtube",
    storedLocally: !!copied,
    mimeType: "image/jpeg",
  };
}

// ---------------------------------------------------------------------------
// X / Twitter

async function ingestX(url: URL): Promise<IngestResult> {
  const canonical = normalizeXUrl(url);
  const oe = await fetchJsonSafely(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(canonical)}`,
  );
  if (!oe) {
    throw new IngestError("NO_PREVIEW", "Couldn't fetch a preview for that X post.");
  }

  const embedHtml = stringField(oe, "html");
  const originAuthor = stringField(oe, "author_name");

  // oEmbed payload doesn't carry a hero image URL — scrape one from the
  // embed HTML so we have something to show in the grid tile.
  let ogImageUrl: string | null = null;
  if (embedHtml) {
    const m = embedHtml.match(/https:\/\/pbs\.twimg\.com\/media\/[^"' )]+/);
    if (m) ogImageUrl = m[0];
  }

  const copied = ogImageUrl ? await tryCopy(ogImageUrl, "image/jpeg") : null;

  return {
    origin: "X",
    sourceUrl: canonical,
    url: copied?.publicUrl ?? ogImageUrl ?? canonical,
    ogImageUrl,
    embedHtml,
    originTitle: null,
    originAuthor,
    mediaType: "tweet",
    storedLocally: !!copied,
    mimeType: ogImageUrl ? "image/jpeg" : null,
  };
}

function normalizeXUrl(u: URL): string {
  // twitter.com and x.com both resolve. Keep whichever host the user pasted.
  return u.toString().split("?")[0].split("#")[0];
}

// ---------------------------------------------------------------------------
// Instagram (OG-card path — no Meta app token required)

async function ingestInstagram(url: URL): Promise<IngestResult> {
  const og = await fetchOg(url.toString());
  if (!og.image) {
    throw new IngestError(
      "NO_PREVIEW",
      "Couldn't find a preview image for that Instagram link. The post may be private.",
    );
  }
  const copied = await tryCopy(og.image);

  return {
    origin: "INSTAGRAM",
    sourceUrl: url.toString(),
    url: copied?.publicUrl ?? og.image,
    ogImageUrl: og.image,
    embedHtml: null, // designed OG-card renders in the grid, no iframe.
    originTitle: og.title,
    originAuthor: og.siteName ?? "Instagram",
    mediaType: "instagram",
    storedLocally: !!copied,
    mimeType: copied?.contentType ?? "image/jpeg",
  };
}

// ---------------------------------------------------------------------------
// Generic web URL

async function ingestGeneric(url: URL): Promise<IngestResult> {
  const og = await fetchOg(url.toString());
  const copied = og.image ? await tryCopy(og.image) : null;

  return {
    origin: "WEB",
    sourceUrl: url.toString(),
    url: copied?.publicUrl ?? og.image ?? url.toString(),
    ogImageUrl: og.image,
    embedHtml: null,
    originTitle: og.title,
    originAuthor: og.siteName,
    // Without an image we can't render a visual tile — fall back to the
    // typographic "link" Tier-C treatment the grid handles specially.
    mediaType: og.image ? "image" : "link",
    storedLocally: !!copied,
    mimeType: copied?.contentType ?? (og.image ? "image/jpeg" : null),
  };
}

// ---------------------------------------------------------------------------
// OG scraping

type OgResult = {
  title: string | null;
  image: string | null;
  siteName: string | null;
  description: string | null;
};

async function fetchOg(target: string): Promise<OgResult> {
  const res = await fetchWithLimits(target, "text/html,application/xhtml+xml");
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("html")) {
    throw new IngestError("NO_PREVIEW", "URL didn't return an HTML page.");
  }
  const html = await res.text();
  if (html.length > MAX_HTML_BYTES) {
    throw new IngestError("FETCH_FAILED", "HTML body too large to parse.");
  }
  const $ = cheerio.load(html);
  const og = (p: string) => $(`meta[property="og:${p}"]`).attr("content")?.trim() || null;
  const meta = (n: string) => $(`meta[name="${n}"]`).attr("content")?.trim() || null;

  const title = og("title") ?? ($("title").first().text().trim() || null);
  const image = og("image") ?? meta("twitter:image") ?? null;
  const siteName = og("site_name") ?? null;
  const description = og("description") ?? meta("description") ?? null;

  return { title, image, siteName, description };
}

async function fetchJsonSafely(target: string): Promise<unknown> {
  try {
    const res = await fetchWithLimits(target, "application/json");
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchWithLimits(target: string, accept: string): Promise<Response> {
  // safeFetch handles: private-IP rejection (SSRF guard), manual redirect
  // follow with re-validation at every hop, timeout, and non-2xx detection.
  // We re-wrap its UnsafeUrlError as IngestError so the adapter layer only
  // has to think about one error shape.
  try {
    return await safeFetch(target, {
      timeoutMs: FETCH_TIMEOUT_MS,
      accept,
      userAgent: UA,
    });
  } catch (e) {
    if (e instanceof IngestError) throw e;
    if (e instanceof UnsafeUrlError) {
      throw new IngestError("FETCH_FAILED", e.message);
    }
    throw new IngestError(
      "FETCH_FAILED",
      e instanceof Error ? e.message : "Upstream fetch failed.",
    );
  }
}

async function tryCopy(remoteUrl: string, preferredContentType?: string) {
  try {
    return await copyRemoteToR2(remoteUrl, preferredContentType);
  } catch {
    return null;
  }
}

function stringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
