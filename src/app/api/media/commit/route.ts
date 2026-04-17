import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// POST /api/media/commit — admin-only. Client calls this after the direct
// R2 POST succeeds, flipping the Media row PENDING→READY so it becomes
// visible to consumers (calendar galleries, agent context, etc.).
//
// We don't verify the R2 object exists via a HEAD request here — that'd
// double the request count for every upload and R2's presigned POST
// policy already enforced content-type + size. If the client lies about
// completion, the stale PENDING row will just never appear anywhere
// (buildRichContext filters to READY only) and the sweeper reaps it.
//
// Caption-rendering note (flagged by security-sentinel): Media.caption is
// persisted verbatim and is currently rendered via react-markdown. That
// is safe *only* while react-markdown runs with its default (sanitizing)
// plugin set. DO NOT add rehype-raw / allowDangerousHtml to the caption
// renderer without re-running a security pass and sanitizing at write
// time. Prefer URL-scheme allowlists in the renderer over free-form HTML.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await requireAdmin();

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

  // updateMany with a status filter keeps this idempotent AND atomic:
  //   - Second commit call is a no-op (count=0) rather than an error.
  //   - A row already marked DELETED is never resurrected to READY.
  const result = await prisma.media.updateMany({
    where: { id: mediaId, status: "PENDING" },
    data: { status: "READY" },
  });

  if (result.count === 0) {
    // Row doesn't exist, or isn't PENDING — either's a client bug or a
    // stale retry. 404 is the least-leaky answer (doesn't distinguish
    // "never existed" from "already committed").
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
