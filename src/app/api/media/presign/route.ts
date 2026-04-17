import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  R2UploadError,
  isAllowedContentType,
  listAllowedContentTypes,
  presignUpload,
} from "@/lib/r2";

// POST /api/media/presign — admin-only. Returns a short-lived presigned
// POST that the browser uses to upload directly to Cloudflare R2 (server
// never touches file bytes). Creates a Media row with status=PENDING so:
//   1. The /commit endpoint can flip it READY by id after the browser
//      confirms the upload finished.
//   2. A future sweeper can reap PENDING rows older than N hours —
//      either the user gave up mid-upload or the R2 POST failed silently.
//
// Auth: requireAdmin throws before we sign anything. Non-admins get 401/403.
// Content-type allowlist is enforced in presignUpload; we surface 400 here.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

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
  // URL pointing at an orphan key.
  await prisma.media.create({
    data: {
      id: presigned.mediaId,
      uploadedById: admin.id,
      url: presigned.publicUrl,
      type: mimeType.startsWith("image/") ? "image" : "other",
      mimeType,
      caption,
      status: "PENDING",
    },
  });

  return NextResponse.json({
    mediaId: presigned.mediaId,
    uploadUrl: presigned.uploadUrl,
    fields: presigned.fields,
    publicUrl: presigned.publicUrl,
    expiresIn: presigned.expiresIn,
    maxBytes: presigned.maxBytes,
  });
}
