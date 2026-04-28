import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import {
  R2UploadError,
  isAllowedContentType,
  listAllowedContentTypes,
  presignSponsorUpload,
} from "@/lib/r2";

// POST /api/admin/sports/sponsors/presign — admin only. Returns a short-
// lived presigned PUT URL under the dedicated `sponsors/<uuid>.<ext>`
// prefix so admin-set imageR2Key values can never pin a sponsor card to
// media owned by another feature (avatars, library, generated). Server
// never touches bytes; the browser PUTs directly to R2.
//
// Rate limit: 5/min, 30/day per admin. Banner uploads are rare; firing
// signals a stolen cookie burning R2 PUT cost.
//
// CSRF: the SESSION_COOKIE is SameSite=Lax which blocks cross-site form
// posts, but `fetch()` from a malicious tab can still race a logged-in
// admin if the cookie is in scope. Belt-and-suspenders: enforce that the
// `Origin` header matches the request host. Any cross-origin call from a
// browser will set Origin to the foreign origin; absence of Origin (e.g.
// curl) is allowed only because admins occasionally test via curl/jq.
//
// Image-shape and alt-text are NOT collected here — they're submitted
// alongside the persisted imageR2Key by the form action that handles
// the SportsSponsor write.

export const runtime = "nodejs";

const PRESIGN_LIMIT = { maxPerMinute: 5, maxPerDay: 30 };

function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Same-origin server-side fetches can omit Origin. Admin curl
    // testing also lacks an Origin header. Trust missing Origin.
    return true;
  }
  const forwardedHost =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    req.nextUrl.host;
  try {
    return new URL(origin).host === forwardedHost;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  if (!isOriginAllowed(req)) {
    return NextResponse.json(
      { error: "Origin mismatch" },
      { status: 403 },
    );
  }

  try {
    await assertWithinLimit(admin.id, "sports.sponsor.presign", PRESIGN_LIMIT);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        {
          error: "Too many sponsor uploads. Slow down.",
          retryAfterSeconds: e.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(e.retryAfterSeconds) },
        },
      );
    }
    throw e;
  }

  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Expected application/json" },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fields =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const mimeType = typeof fields.mimeType === "string" ? fields.mimeType : "";

  if (!mimeType) {
    return NextResponse.json(
      { error: "mimeType is required" },
      { status: 400 },
    );
  }
  if (!isAllowedContentType(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported type. Allowed: ${listAllowedContentTypes().join(", ")}` },
      { status: 400 },
    );
  }

  let presigned;
  try {
    presigned = await presignSponsorUpload({ mimeType });
  } catch (e) {
    if (e instanceof R2UploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({
    sponsorMediaId: presigned.sponsorMediaId,
    key: presigned.key,
    uploadUrl: presigned.uploadUrl,
    publicUrl: presigned.publicUrl,
    contentType: presigned.contentType,
    expiresIn: presigned.expiresIn,
    maxBytes: presigned.maxBytes,
  });
}
