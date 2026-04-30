import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import {
  R2UploadError,
  isAllowedContentType,
  listAllowedContentTypes,
  presignWagUpload,
} from "@/lib/r2";

// POST /api/admin/sports/wags/presign — admin only. Mirrors the sponsor
// presign route: returns a short-lived presigned PUT URL under the
// dedicated `wags/<uuid>.<ext>` prefix so admin-set imageR2Key values
// can never pin a WAG row to media owned by another feature (avatars,
// library, generated, sponsors). Server never touches bytes; the
// browser PUTs directly to R2.
//
// Rate limit: 5/min, 30/day per admin. Banner uploads are rare; firing
// signals a stolen cookie burning R2 PUT cost.
//
// CSRF: SESSION_COOKIE is SameSite=Lax which blocks cross-site form
// posts, but `fetch()` from a malicious tab can still race a logged-in
// admin if the cookie is in scope. Belt-and-suspenders: enforce that
// the `Origin` header matches the request host.

export const runtime = "nodejs";

const PRESIGN_LIMIT = { maxPerMinute: 5, maxPerDay: 30 };

function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
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
    return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  }

  try {
    await assertWithinLimit(admin.id, "sports.wag.presign", PRESIGN_LIMIT);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        {
          error: "Too many WAG uploads. Slow down.",
          retryAfterSeconds: e.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } },
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
    return NextResponse.json({ error: "mimeType is required" }, { status: 400 });
  }
  if (!isAllowedContentType(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported type. Allowed: ${listAllowedContentTypes().join(", ")}` },
      { status: 400 },
    );
  }

  let presigned;
  try {
    presigned = await presignWagUpload({ mimeType });
  } catch (e) {
    if (e instanceof R2UploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({
    wagMediaId: presigned.wagMediaId,
    key: presigned.key,
    uploadUrl: presigned.uploadUrl,
    publicUrl: presigned.publicUrl,
    contentType: presigned.contentType,
    expiresIn: presigned.expiresIn,
    maxBytes: presigned.maxBytes,
  });
}
