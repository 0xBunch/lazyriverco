// Safe-media URL helpers.
//
// Shared by ChatMessage (inline rendering) and MessageActions (share-image
// short-circuit). These functions are pure — no browser APIs, no React —
// so server-side callers can use them too if the share-image route ever
// grows a raw-passthrough variant.
//
// The NEXT_PUBLIC_R2_PUBLIC_BASE_URL check is evaluated once at module
// load; if the env var isn't set, every URL is rejected.

const MEDIA_ORIGIN: string | null = (() => {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
})();

// Paths we consider "safe media": user uploads under /media/ and AI-
// generated images under /generated/. Both use server-assigned UUID keys
// with extensions drawn from the upload allowlist. Same shape either way.
export const MEDIA_KEY_REGEX =
  /^\/(media|generated)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp|gif|mp4)$/i;

export function isSafeMediaUrl(raw: string): boolean {
  if (!MEDIA_ORIGIN) return false;
  try {
    const u = new URL(raw);
    return u.origin === MEDIA_ORIGIN && MEDIA_KEY_REGEX.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Extract every safe media URL from a message body. Used by ChatMessage to
 * render images / videos inline below the text. Strips trailing sentence
 * punctuation so a URL at the end of a sentence still matches.
 */
export function extractSafeMediaUrls(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s<>)]+/g) ?? [];
  const seen = new Set<string>();
  const safe: string[] = [];
  for (const m of matches) {
    const cleaned = m.replace(/[.,;:!?)]+$/, "");
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    if (isSafeMediaUrl(cleaned)) safe.push(cleaned);
  }
  return safe;
}

export function isVideoUrl(url: string): boolean {
  return url.toLowerCase().endsWith(".mp4");
}

/**
 * Returns the URL if the message content is purely a single safe media URL
 * (common shape for generated-image replies: `content = "https://.../generated/<uuid>.webp"`).
 * Returns null when the content has any other text — mixed text + image
 * messages keep the OG-card share path instead of the direct-image path.
 *
 * The strict equality check against `content.trim()` is intentional: we
 * only want to treat the message as "the image is the message" when
 * there's literally nothing else to say.
 */
export function isImageOnlyMessage(content: string): string | null {
  const trimmed = content.trim();
  const urls = extractSafeMediaUrls(trimmed);
  if (urls.length !== 1) return null;
  if (trimmed !== urls[0]) return null;
  return urls[0];
}

/**
 * Strip safe-media URLs from a message body, leaving other text (and any
 * non-media URLs) intact. Used by ChatMessage before handing mixed-content
 * messages to the markdown renderer: images render via the dedicated
 * <img> column, so the raw URL shouldn't double up as auto-linked text.
 *
 * Preserves trailing sentence punctuation so stripping a URL from the
 * middle of a sentence doesn't leave a dangling period floating alone.
 * Collapses runs of 3+ newlines to 2 so paragraph rhythm survives.
 */
export function stripSafeMediaUrls(content: string): string {
  if (!MEDIA_ORIGIN) return content;
  const stripped = content.replace(/https?:\/\/[^\s<>)]+/g, (match) => {
    const cleaned = match.replace(/[.,;:!?)]+$/, "");
    const trailing = match.slice(cleaned.length);
    return isSafeMediaUrl(cleaned) ? trailing : match;
  });
  // Tidy whitespace left behind by removed URLs without disturbing
  // intentional blank lines between paragraphs.
  return stripped
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Given a content-type string (possibly with params like `image/webp; charset=utf-8`),
 * return the bare MIME type. Falls back to `image/webp` — the default format
 * our image-gen path requests from Replicate.
 */
export function normalizeImageContentType(raw: string | null | undefined): string {
  const bare = (raw ?? "").split(";")[0].trim().toLowerCase();
  if (bare.startsWith("image/")) return bare;
  return "image/webp";
}

/**
 * Extension for a given image MIME type. Returned without the leading dot.
 */
export function extensionForImageMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
    default:
      return "webp";
  }
}
