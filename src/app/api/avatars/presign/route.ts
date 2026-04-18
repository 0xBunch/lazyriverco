import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import {
  R2UploadError,
  isAllowedContentType,
  listAllowedContentTypes,
  presignAvatarUpload,
} from "@/lib/r2";

// POST /api/avatars/presign — admin only. Returns a short-lived presigned
// POST that the browser uses to upload an agent headshot directly to R2
// (server never touches bytes). Unlike /api/media/presign we do NOT create
// a DB row — the caller persists the returned publicUrl directly to
// Character.avatarUrl via the admin server action. Uploads that never get
// saved leave orphan R2 objects with UUID keys under avatars/; acceptable
// trade-off since keys are unreachable by enumeration, capped at 2 MB, and
// the route is admin-only.
//
// Rate limit: 5/min, 30/day per admin. There are ~a dozen agent entities
// total; firing this limit signals a stolen cookie, not legitimate use.

export const runtime = "nodejs";

const PRESIGN_LIMIT = { maxPerMinute: 5, maxPerDay: 30 };

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  try {
    await assertWithinLimit(admin.id, "avatars.presign", PRESIGN_LIMIT);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Too many avatar uploads. Slow down.", retryAfterSeconds: e.retryAfterSeconds },
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
    presigned = await presignAvatarUpload({ mimeType });
  } catch (e) {
    if (e instanceof R2UploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({
    avatarId: presigned.avatarId,
    uploadUrl: presigned.uploadUrl,
    fields: presigned.fields,
    publicUrl: presigned.publicUrl,
    expiresIn: presigned.expiresIn,
    maxBytes: presigned.maxBytes,
  });
}
