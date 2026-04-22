import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlayerPartner, isPartnersEnabled } from "@/lib/player-partner";

export const runtime = "nodejs";

// Image proxy for the partner card. The partner.imageUrl in the DB can
// point at ANY public HTTPS image the extraction model returned
// (Wikipedia, Instagram CDN, Getty preview, ESPN, wire services). Rather
// than have the browser hotlink (which fails across referrer policies,
// CORS, and Instagram's aggressive cross-origin blocks), we fetch the
// bytes server-side and stream them back from our own origin.
//
// Tradeoffs, per KB override on 2026-04-21: we're serving the bytes
// from our domain which is technically a stronger legal/copyright
// posture than pure hotlinking (we're re-serving, not just pointing).
// Accepted risk for a private 7-user demo. If anyone objects we flip
// SLEEPER_PARTNERS_ENABLED off and the route returns 503.
//
// Defense at the proxy boundary:
//   - Only proxies URLs we already stored via the extraction pipeline
//     (validated via sanitizeImageUrl — HTTPS + real image extension).
//   - Re-validates content-type at fetch time; rejects anything that
//     isn't image/*.
//   - Caps response bytes at 8MB to stop a huge payload blowing memory.
//   - 10s fetch timeout.
//   - Caches aggressively downstream (1 day) so we don't re-fetch on
//     every page view.

const PLAYER_ID_RE = /^\d{1,10}$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; LazyRiverCo/1.0; +https://lazyriver.co)";

export async function GET(
  _req: Request,
  { params }: { params: { playerId: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPartnersEnabled()) {
    return NextResponse.json(
      { error: "disabled" },
      { status: 503 },
    );
  }
  const playerId = params.playerId?.trim() ?? "";
  if (!PLAYER_ID_RE.test(playerId)) {
    return NextResponse.json({ error: "Invalid playerId" }, { status: 400 });
  }

  const partner = await getPlayerPartner(playerId);
  if (!partner?.imageUrl) {
    return NextResponse.json({ error: "No image" }, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(partner.imageUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/*,*/*;q=0.8",
        // Pretend we came from the source domain so Instagram/Getty
        // hotlink-blockers are less aggressive. Not foolproof; some
        // CDNs still 403 even with a matching referrer, in which case
        // the card falls back to initials client-side.
        Referer: new URL(partner.imageUrl).origin + "/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    console.warn(
      `[partner/image] fetch failed for ${playerId}:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: "not an image" },
      { status: 415 },
    );
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
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.byteLength),
      // One-day cache — partner rows are basically static once generated
      // (re-roll by deleting the DB row), so the image won't change
      // underneath us in a way that matters for a demo.
      "Cache-Control":
        "private, max-age=86400, stale-while-revalidate=604800",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self' data:",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
