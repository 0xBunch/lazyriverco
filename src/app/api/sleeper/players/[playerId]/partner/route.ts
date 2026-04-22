import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  generatePlayerPartner,
  getPlayerPartner,
  isPartnersEnabled,
} from "@/lib/player-partner";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Sleeper player IDs are 1-10 digit numeric strings. Mirror the gate on
// the /take route so a malformed URL param can't reach Prisma or Claude.
const PLAYER_ID_RE = /^\d{1,10}$/;

function bad(
  body: Record<string, unknown>,
  status: number,
  extra?: ResponseInit,
): NextResponse {
  return NextResponse.json(body, { status, ...extra });
}

/**
 * GET — read-only cache lookup. Returns `{ partner: PartnerRow | null }`.
 * Never triggers a Gemini call, never writes to the DB. Cheap, fast,
 * safe to fire on every profile mount.
 */
export async function GET(
  _req: Request,
  { params }: { params: { playerId: string } },
) {
  const user = await getCurrentUser();
  if (!user) return bad({ error: "Unauthorized" }, 401);
  if (!isPartnersEnabled()) {
    return bad({ error: "WAGFINDER disabled", code: "DISABLED" }, 503);
  }
  const playerId = params.playerId?.trim() ?? "";
  if (!PLAYER_ID_RE.test(playerId)) {
    return bad({ error: "Invalid playerId" }, 400);
  }

  try {
    const partner = await getPlayerPartner(playerId);
    return NextResponse.json(
      { partner },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/sleeper/players/partner GET] failed:", err);
    return bad({ error: "cache read failed" }, 500);
  }
}

/**
 * POST — manual WAGFINDER trigger. Runs the Gemini + Wikipedia pipeline
 * and persists the result. Rate-limited; the upstream pipeline owns its
 * own ~30s timeout internally so slow searches don't wedge the handler.
 */
export async function POST(
  _req: Request,
  { params }: { params: { playerId: string } },
) {
  const user = await getCurrentUser();
  if (!user) return bad({ error: "Unauthorized" }, 401);
  if (!isPartnersEnabled()) {
    return bad({ error: "WAGFINDER disabled", code: "DISABLED" }, 503);
  }
  const playerId = params.playerId?.trim() ?? "";
  if (!PLAYER_ID_RE.test(playerId)) {
    return bad({ error: "Invalid playerId" }, 400);
  }

  // Tight rate limit — each call runs Gemini + web search + (sometimes)
  // a Wikipedia lookup. 10/min / 60/day per user is plenty for someone
  // clicking around profiles; stops a scripted sweep of the NFL DB.
  try {
    await assertWithinLimit(user.id, "player.partner", {
      maxPerMinute: 10,
      maxPerDay: 60,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return bad(
        { error: "Rate limit exceeded", code: "RATE_LIMITED" },
        429,
        { headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  try {
    const partner = await generatePlayerPartner(playerId);
    return NextResponse.json(
      { partner },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/sleeper/players/partner POST] failed:", err);
    return bad({ error: "lookup failed" }, 500);
  }
}
