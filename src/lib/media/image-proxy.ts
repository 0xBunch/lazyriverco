// Shared image-proxy core. Fetches a remote image URL server-side,
// validates content-type + byte size, and returns a Response built
// with the same hardened headers (CSP, nosniff, downstream cache) the
// partner image route shipped with. Used by:
//
//   - /api/sleeper/players/[playerId]/partner/image (WAGFINDER)
//   - /api/sports/wag/image (SportsWag — /sports landing)
//
// The point of extracting this is consistency: both surfaces enforce
// the same content-type, size cap, and cache policy. Adding another
// proxy surface in the future is one import.

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; LazyRiverCo/1.0; +https://lazyriver.co)";

/// Fetch `url` server-side and return a streamable Response. The caller
/// is responsible for verifying that `url` was already sanitized at
/// write time — the proxy enforces content-type and byte size at
/// fetch time, but it does NOT re-validate the URL shape (whitelist /
/// extension / etc.) since the calling routes already gate that.
export async function proxyImage(url: string): Promise<Response> {
  let upstream: Response;
  let originReferer: string;
  try {
    originReferer = new URL(url).origin + "/";
  } catch {
    return new Response(JSON.stringify({ error: "invalid url" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    upstream = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/*,*/*;q=0.8",
        // Pretend we came from the source domain so Instagram/Getty
        // hotlink-blockers are less aggressive. Not foolproof; some
        // CDNs still 403 even with a matching referrer, in which case
        // the caller falls back to initials/placeholder client-side.
        Referer: originReferer,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    console.warn(
      "[image-proxy] fetch failed:",
      err instanceof Error ? err.message : err,
    );
    return new Response(JSON.stringify({ error: "fetch failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `upstream ${upstream.status}` }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return new Response(JSON.stringify({ error: "not an image" }), {
      status: 415,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contentLengthHeader = upstream.headers.get("content-length");
  const declaredLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : null;
  if (
    declaredLength !== null &&
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_IMAGE_BYTES
  ) {
    return new Response(JSON.stringify({ error: "too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return new Response(JSON.stringify({ error: "too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.byteLength),
      // Generous downstream cache — sources are basically static once
      // entered (re-roll by editing the row); a stale-while-revalidate
      // window covers the case where the row image URL changes.
      "Cache-Control":
        "private, max-age=86400, stale-while-revalidate=604800",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self' data:",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
