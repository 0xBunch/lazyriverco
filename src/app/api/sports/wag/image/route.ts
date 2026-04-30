import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { proxyImage } from "@/lib/media/image-proxy";

export const runtime = "nodejs";

// Image proxy for SportsWag.imageUrl. Mirrors the partner-image route
// (re-serves bytes from our origin so cross-origin hotlink blockers
// don't apply), but keyed on the SportsWag id rather than a Sleeper
// playerId. Auth-gated to signed-in users only — same gate as the
// /sports landing.
//
// Hidden WAGs are not served, even if their id is known: they're soft-
// deleted and shouldn't render anywhere. Future Track B media table
// can swap to a different lookup path; this route stays narrow.

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const wagId = (url.searchParams.get("wagId") ?? "").trim();
  if (!ID_RE.test(wagId)) {
    return NextResponse.json({ error: "Invalid wagId" }, { status: 400 });
  }

  const wag = await prisma.sportsWag.findUnique({
    where: { id: wagId },
    select: { imageUrl: true, imageR2Key: true, hidden: true },
  });
  if (!wag || wag.hidden) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prefer the R2 public URL when an admin uploaded a permanent copy.
  // R2 public is hotlink-safe so we 302 the browser there directly
  // and skip re-serving bytes through this origin.
  const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (wag.imageR2Key && r2Base) {
    const target = `${r2Base.replace(/\/+$/, "")}/${wag.imageR2Key}`;
    return NextResponse.redirect(target, 302);
  }

  if (!wag.imageUrl) {
    return NextResponse.json({ error: "No image" }, { status: 404 });
  }

  return proxyImage(wag.imageUrl);
}
