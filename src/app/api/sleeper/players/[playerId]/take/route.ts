import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isSleeperEnabled } from "@/lib/sleeper";
import { generatePlayerAgentTakes } from "@/lib/sleeper-ai";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Wall-clock cap on the upstream Claude fan-out. Guards the first-load UX
// from a slow model — the route returns whatever cached takes exist after
// the timeout and the background promise continues (then caches) so the
// next page load has the full set.
const TAKE_FANOUT_TIMEOUT_MS = 9_500;

// Sleeper player IDs are 1-10 digit numeric strings. Validate on the server
// mirror-image of the client-side regex in PlayerProfileView so a
// pathologically-long or non-numeric URL param gets rejected before it
// reaches Prisma or Claude.
const PLAYER_ID_RE = /^\d{1,10}$/;

export async function GET(
  _req: Request,
  { params }: { params: { playerId: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSleeperEnabled()) {
    return NextResponse.json(
      { error: "Sleeper integration disabled", code: "DISABLED" },
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

  // Rate-limit before Claude fan-out so a scripted sweep can't burn spend.
  // Caps: 30 take-requests/min (~a power user clicking around a roster)
  // and 300/day (~browsing every player in a 12-team league twice).
  try {
    await assertWithinLimit(user.id, "player.take", {
      maxPerMinute: 30,
      maxPerDay: 300,
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

  try {
    const takes = await Promise.race([
      generatePlayerAgentTakes(playerId),
      new Promise<[]>((resolve) =>
        setTimeout(() => resolve([]), TAKE_FANOUT_TIMEOUT_MS),
      ),
    ]);
    return NextResponse.json(
      { takes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/sleeper/players/take] failed:", err);
    return NextResponse.json(
      { error: "take generation failed" },
      { status: 500 },
    );
  }
}
