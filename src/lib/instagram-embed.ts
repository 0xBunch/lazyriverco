// Instagram embed helpers.
//
// Instagram's no-auth embed endpoint is
//   https://www.instagram.com/p/{shortcode}/embed/captioned/
// which works for posts (/p/), reels (/reel/), and TV (/tv/). All three
// are served off the /p/ path, so we canonicalize.
//
// Shortcode shape per Instagram: alphanumerics plus `-` and `_`, typically
// 11 characters but we don't lock the length (reels sometimes run longer).

const IG_HOST_RE = /(^|\.)instagram\.com$/;
const IG_PATH_RE = /^\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?/;

export function parseInstagramShortcode(
  sourceUrl: string | null | undefined,
): string | null {
  if (!sourceUrl) return null;
  try {
    const u = new URL(sourceUrl);
    if (!IG_HOST_RE.test(u.hostname.toLowerCase())) return null;
    const m = u.pathname.match(IG_PATH_RE);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

export function instagramEmbedUrl(shortcode: string): string {
  return `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed/captioned/`;
}
