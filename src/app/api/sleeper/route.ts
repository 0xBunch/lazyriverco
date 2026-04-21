import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  bustSleeperCache,
  getLeagueOverview,
  getRecentTransactions,
  getRosters,
  getStandings,
  isSleeperEnabled,
  SleeperError,
  syncPlayerDb,
} from "@/lib/sleeper";

export const runtime = "nodejs";

function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof SleeperError) {
    const status =
      err.code === "DISABLED" || err.code === "MISCONFIGURED" ? 503 : 502;
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status },
    );
  }
  console.error("[api/sleeper] unexpected error", err);
  return NextResponse.json(
    { error: "Internal error", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function GET(req: NextRequest) {
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

  const view = req.nextUrl.searchParams.get("view") ?? "overview";
  try {
    if (view === "overview") {
      const overview = await getLeagueOverview();
      return NextResponse.json(overview, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (view === "standings") {
      return NextResponse.json(
        { standings: await getStandings() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (view === "rosters") {
      return NextResponse.json(
        { rosters: await getRosters() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (view === "transactions") {
      const limitRaw = Number(
        req.nextUrl.searchParams.get("limit") ?? "25",
      );
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(100, Math.floor(limitRaw))
          : 25;
      return NextResponse.json(
        { transactions: await getRecentTransactions(limit) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: `Unknown view "${view}"` },
      { status: 400 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

// POST: admin-only. Bust the cache + optionally refresh the SleeperPlayer
// reference table. Returns the fresh overview so the client can re-render
// without a second round-trip.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isSleeperEnabled()) {
    return NextResponse.json(
      { error: "Sleeper integration disabled", code: "DISABLED" },
      { status: 503 },
    );
  }

  let body: { syncPlayers?: boolean } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = (await req.json()) as typeof body;
    }
  } catch {
    // Empty/invalid body — treat as default opts.
  }

  bustSleeperCache();

  try {
    const [overview, playerSync] = await Promise.all([
      getLeagueOverview(),
      body.syncPlayers ? syncPlayerDb({ force: true }) : Promise.resolve(null),
    ]);
    return NextResponse.json(
      { overview, playerSync },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
