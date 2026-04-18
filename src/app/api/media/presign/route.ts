import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import {
  R2UploadError,
  isAllowedContentType,
  listAllowedContentTypes,
  presignUpload,
} from "@/lib/r2";

// POST /api/media/presign — any signed-in member. Returns a short-lived
// presigned PUT URL that the browser streams the raw file body to
// (server never touches file bytes). Creates a Media row status=PENDING so:
//   1. /commit flips it to READY — and HEADs the R2 object to enforce the
//      size cap, since PUT presigns can't embed a content-length policy.
//   2. A future sweeper can reap stale PENDING rows.
//
// Auth: requireUser — any signed-in member can upload. Abuse defense is
// the per-user rate limit below.
// Content-type allowlist is enforced in presignUpload; we surface 400 here.

export const runtime = "nodejs";

// 10/min allows a drag-drop of 10 photos; 100/day is well above any
// legitimate usage for a 7-member clubhouse. If a member ever trips it,
// that's a signal worth investigating (script kiddy in a cookie, client
// retry loop), not a number to quietly raise.
const PRESIGN_LIMIT = { maxPerMinute: 10, maxPerDay: 100 };

export async function POST(req: NextRequest) {
  const user = await requireUser();

  try {
    await assertWithinLimit(user.id, "media.presign", PRESIGN_LIMIT);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Too many uploads. Slow down.", retryAfterSeconds: e.retryAfterSeconds },
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
  const caption =
    typeof fields.caption === "string" && fields.caption.trim().length > 0
      ? fields.caption.trim().slice(0, 500)
      : null;

  if (!mimeType) {
    return NextResponse.json(
      { error: "mimeType is required" },
      { status: 400 },
    );
  }
  if (!isAllowedContentType(mimeType)) {
    return NextResponse.json(
      {
        error: `Unsupported type. Allowed: ${listAllowedContentTypes().join(", ")}`,
      },
      { status: 400 },
    );
  }

  let presigned;
  try {
    presigned = await presignUpload({ mimeType });
  } catch (e) {
    if (e instanceof R2UploadError) {
      // Configuration / validation issue. Message is safe to surface —
      // it never includes credentials, only "set X env var" / allowlist
      // guidance.
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  // Persist the Media row BEFORE returning the presigned URL. If the
  // Media insert fails we bail entirely rather than hand the client a
  // URL pointing at an orphan key. `origin` defaults to UPLOAD in the
  // schema and storedLocally is set true because this path writes
  // directly to our R2 bucket (vs. URL-ingested items that reference
  // remote hosts until a copy lands).
  await prisma.media.create({
    data: {
      id: presigned.mediaId,
      uploadedById: user.id,
      url: presigned.publicUrl,
      type: mimeType.startsWith("image/") ? "image" : "other",
      mimeType,
      caption,
      status: "PENDING",
      storedLocally: true,
    },
  });

  return NextResponse.json({
    mediaId: presigned.mediaId,
    uploadUrl: presigned.uploadUrl,
    publicUrl: presigned.publicUrl,
    contentType: presigned.contentType,
    expiresIn: presigned.expiresIn,
    maxBytes: presigned.maxBytes,
  });
}
