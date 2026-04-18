import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  MAX_UPLOAD_BYTES,
  R2UploadError,
  assertObjectWithinSize,
  deleteObject,
} from "@/lib/r2";

// POST /api/media/commit — any signed-in member. Client calls this after
// the direct R2 PUT succeeds, flipping the Media row PENDING→READY so it
// becomes visible to consumers (calendar galleries, agent context, etc.).
//
// Size enforcement (required because PUT presigns can't embed a
// content-length policy): we HEAD the R2 object here and reject + delete
// if it exceeds MAX_UPLOAD_BYTES. This is a Class B op (cheap). If the
// object is missing (client lied about the PUT succeeding), HEAD throws
// and we 404. Without this check an authenticated client could burn R2
// storage by PUT-ing arbitrarily large bytes to a valid presigned URL.
//
// Ownership check: the updateMany where-clause includes uploadedById so
// member A can't flip member B's PENDING row to READY by guessing a
// UUID. Defense in depth — UUIDs are unguessable in practice, but the
// check is free.
//
// Caption-rendering note (flagged by security-sentinel): Media.caption is
// persisted verbatim and is currently rendered via react-markdown. That
// is safe *only* while react-markdown runs with its default (sanitizing)
// plugin set. DO NOT add rehype-raw / allowDangerousHtml to the caption
// renderer without re-running a security pass and sanitizing at write
// time. Prefer URL-scheme allowlists in the renderer over free-form HTML.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await requireUser();

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
  const mediaId = typeof fields.mediaId === "string" ? fields.mediaId : "";

  if (!mediaId) {
    return NextResponse.json(
      { error: "mediaId is required" },
      { status: 400 },
    );
  }

  // Find the PENDING row (scoped to this user) so we know the R2 key to
  // HEAD. Doing this first — and only flipping to READY after the size
  // check passes — means oversized uploads never become visible.
  const pending = await prisma.media.findFirst({
    where: { id: mediaId, status: "PENDING", uploadedById: user.id },
    select: { id: true, url: true },
  });
  if (!pending) {
    return NextResponse.json(
      { error: "Media not found or already committed" },
      { status: 404 },
    );
  }

  // Derive the R2 key from the publicUrl: everything after the base host
  // is the key (e.g. "media/<uuid>.jpg"). Keeping this derivation local
  // because Media schema doesn't currently persist the key separately.
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";
  const key = pending.url.startsWith(publicBase)
    ? pending.url.slice(publicBase.replace(/\/+$/, "").length + 1)
    : null;
  if (!key) {
    return NextResponse.json(
      { error: "Media URL does not match R2 public base." },
      { status: 500 },
    );
  }

  // Size enforcement: HEAD the R2 object and reject if it's too big. If
  // it's missing entirely (client lied about PUT success), throws to the
  // catch below and returns 404.
  try {
    await assertObjectWithinSize(key, MAX_UPLOAD_BYTES);
  } catch (e) {
    if (e instanceof R2UploadError) {
      // Oversized or missing — delete the R2 object and the PENDING row
      // so the sweeper doesn't have to chase it.
      await deleteObject(key).catch(() => {});
      await prisma.media.delete({ where: { id: pending.id } }).catch(() => {});
      return NextResponse.json({ error: e.message }, { status: 413 });
    }
    throw e;
  }

  // Flip PENDING → READY. updateMany keeps this idempotent under retries
  // and scoped to the caller's own upload (defense in depth; we already
  // asserted ownership via findFirst above).
  const result = await prisma.media.updateMany({
    where: { id: mediaId, status: "PENDING", uploadedById: user.id },
    data: { status: "READY" },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Media not found or already committed" },
      { status: 404 },
    );
  }

  // Return the known-good state without a follow-up findUnique. The
  // client already has url/mimeType/caption from the presign response;
  // all we need to confirm is that the status flip succeeded. Avoids a
  // TOCTOU between updateMany and a subsequent read that could observe
  // another writer's state change.
  return NextResponse.json({ mediaId, status: "READY" });
}
