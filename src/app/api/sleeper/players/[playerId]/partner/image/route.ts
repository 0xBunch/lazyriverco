import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlayerPartner, isPartnersEnabled } from "@/lib/player-partner";
import { proxyImage } from "@/lib/media/image-proxy";

export const runtime = "nodejs";

// Image proxy for the partner card. partner.imageUrl in the DB can
// point at any public HTTPS image the extraction model returned
// (Wikipedia, Instagram CDN, Getty preview, ESPN, wire services).
// Rather than have the browser hotlink (which fails across referrer
// policies, CORS, and Instagram's aggressive cross-origin blocks), we
// fetch the bytes server-side via the shared proxyImage helper.
//
// Tradeoffs, per KB override on 2026-04-21: we're serving the bytes
// from our domain which is technically a stronger legal/copyright
// posture than pure hotlinking. Accepted risk for a private 7-user
// demo. If anyone objects we flip SLEEPER_PARTNERS_ENABLED off and
// the route returns 503.

const PLAYER_ID_RE = /^\d{1,10}$/;

export async function GET(
  _req: Request,
  { params }: { params: { playerId: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPartnersEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 503 });
  }
  const playerId = params.playerId?.trim() ?? "";
  if (!PLAYER_ID_RE.test(playerId)) {
    return NextResponse.json({ error: "Invalid playerId" }, { status: 400 });
  }

  const partner = await getPlayerPartner(playerId);
  if (!partner?.imageUrl) {
    return NextResponse.json({ error: "No image" }, { status: 404 });
  }

  return proxyImage(partner.imageUrl);
}
