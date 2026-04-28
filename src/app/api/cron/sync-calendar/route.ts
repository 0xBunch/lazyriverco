import { NextResponse } from "next/server";
import { runAllProviders } from "@/lib/calendar-providers";

// Daily cron entrypoint for calendar sync providers (Nager holidays,
// USNO astronomy, ESPN NFL). Mirrors the auth + shape of the news
// poll-feeds cron — same x-cron-secret header, same "GET or POST" so
// the Railway cron command can be a plain curl.
//
// Wire on Railway:
//   curl -H "x-cron-secret: $CRON_SECRET" https://lazyriver.co/api/cron/sync-calendar
//   schedule: 0 9 * * *   (daily at 09:00 UTC = 4 AM US-Central)
//
// Daily cadence is fine — none of the data sources change intra-day
// (holidays, moon phases, NFL schedule). Errors in any single provider
// don't fail the response; they surface in the per-provider results
// array so an admin reading Railway logs can spot which feed broke.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured." },
      { status: 500 },
    );
  }
  const provided = req.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  const results = await runAllProviders();
  const totalUpserted = results.reduce((acc, r) => acc + r.upserted, 0);
  const anyErrors = results.some((r) => r.errors.length > 0);

  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - startedAt,
    totalUpserted,
    anyErrors,
    results,
  });
}
