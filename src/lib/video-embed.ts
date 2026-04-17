// Tiny YouTube/Vimeo URL → iframe embed URL translator. Admin pastes a
// watch URL (the thing they'd share with a friend) and we convert it
// server-side into the embed form needed for <iframe src>. Keeps the
// admin UX pedestrian — "paste a link, see it embed" — and confines the
// host-matching logic to one file so adding new providers (if ever)
// doesn't scatter through render paths.
//
// Returns null for any URL we can't translate; the caller decides whether
// to surface a validation error or quietly skip the embed.

export type VideoEmbed = {
  iframeSrc: string;
  provider: "youtube" | "vimeo";
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

export function parseVideoEmbed(rawUrl: string | null | undefined): VideoEmbed | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const videoId = extractYouTubeId(url);
    if (!videoId) return null;
    return {
      iframeSrc: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
      provider: "youtube",
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const videoId = extractVimeoId(url);
    if (!videoId) return null;
    return {
      iframeSrc: `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`,
      provider: "vimeo",
    };
  }

  return null;
}

function extractYouTubeId(url: URL): string | null {
  // youtu.be/ID
  if (url.hostname.endsWith("youtu.be")) {
    const id = url.pathname.slice(1).split("/")[0];
    return isValidVideoId(id) ? id : null;
  }
  // youtube.com/watch?v=ID
  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return id && isValidVideoId(id) ? id : null;
  }
  // youtube.com/embed/ID  or /shorts/ID or /live/ID
  const seg = url.pathname.split("/").filter(Boolean);
  if (seg.length >= 2 && (seg[0] === "embed" || seg[0] === "shorts" || seg[0] === "live")) {
    return isValidVideoId(seg[1]!) ? seg[1]! : null;
  }
  return null;
}

function extractVimeoId(url: URL): string | null {
  // vimeo.com/123456789  or  /123456789/abcdef (unlisted hash)
  // player.vimeo.com/video/123456789
  const seg = url.pathname.split("/").filter(Boolean);
  if (seg[0] === "video" && seg[1]) {
    return /^\d+$/.test(seg[1]) ? seg[1] : null;
  }
  if (seg[0] && /^\d+$/.test(seg[0])) return seg[0];
  return null;
}

function isValidVideoId(id: string | undefined): id is string {
  // YouTube IDs are 11 chars of [A-Za-z0-9_-]. Vimeo validated separately.
  return !!id && /^[A-Za-z0-9_-]{6,32}$/.test(id);
}
