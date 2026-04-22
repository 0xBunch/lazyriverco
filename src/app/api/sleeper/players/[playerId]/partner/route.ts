import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  generatePlayerPartner,
  isPartnersEnabled,
} from "@/lib/player-partner";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Sleeper player IDs are 1-10 digit numeric strings. Mirror the gate on
// the /take route so a malformed URL param can't reach Prisma or Claude.
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
    return NextResponse.json(
      { error: "Partner lookup disabled", code: "DISABLED" },
      { status: 503 },
    );
  }
  const playerId = params.playerId?.trim() ?? "";
  if (!PLAYER_ID_RE.test(playerId)) {
    return NextResponse.json(
      { error: "Invalid playerId" },
      { status: 400 },
    );
  }

  // Tight rate limit — each cache miss runs a Claude + web_search call
  // (more expensive than the takes endpoint). 10/min / 60/day is plenty
  // for a human clicking profiles; it stops a scripted sweep.
  try {
    await assertWithinLimit(user.id, "player.partner", {
      maxPerMinute: 10,
      maxPerDay: 60,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Rate limit exceeded", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(err.retryAfterSeconds) },
        },
      );
    }
    throw err;
  }

  // No extra timeout here — generatePlayerPartner owns the AbortController
  // that caps the upstream Claude call. On timeout it returns null; the
  // DB row is NOT written so the next page load re-tries. That's the
  // right behavior for "Claude was slow" vs "genuinely no info found".
  try {
    const partner = await generatePlayerPartner(playerId);
    return NextResponse.json(
      { partner },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/sleeper/players/partner] failed:", err);
    return NextResponse.json(
      { error: "partner lookup failed" },
      { status: 500 },
    );
  }
}
