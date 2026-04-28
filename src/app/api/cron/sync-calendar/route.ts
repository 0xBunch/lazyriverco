import { NextResponse } from "next/server";

// DEPRECATED — this route is a stub for back-compat with the Railway
// scheduled job that PR #109 wired up. Calendar feeds now live as
// CALENDAR-kind Feed rows polled by /api/cron/poll-feeds (the same
// 15-min cron that handles NEWS/MEDIA feeds), so a separate daily
// "sync-calendar" tick is redundant.
//
// Removal sequence:
//   1. This PR — route returns { deprecated: true } so the Railway
//      cron's curl command keeps getting 200s instead of 404s.
//   2. KB removes the daily sync-calendar entry from Railway's cron
//      config.
//   3. Follow-up PR deletes this file.
//
// During the brief window between (1) and (2) both crons may fire.
// The (source, externalId) unique on CalendarEntry prevents
// duplicates; syncedAt may flap by ≤1 day. Acceptable transient.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  return handle();
}

export async function GET() {
  return handle();
}

function handle() {
  return NextResponse.json({
    ok: true,
    deprecated: true,
    replacement: "/api/cron/poll-feeds",
    message:
      "Calendar feeds are now CALENDAR-kind Feed rows polled by /api/cron/poll-feeds. Remove this scheduled job from Railway.",
  });
}
