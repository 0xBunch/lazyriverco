import { NextResponse } from "next/server";
import { pollTick } from "@/lib/feed-tick";

// Manual / fallback HTTP cron entrypoint for the RSS feed poller.
//
// Status (2026-04-29): this route used to be hit every 15 min by
// cron-job.org. Scheduled polling has migrated to Trigger.dev
// (src/trigger/feeds.ts). The HTTP route stays as:
//   - a manual trigger for one-off polls during incident response,
//   - a fallback if Trigger.dev is down,
//   - a smoke-test target for deploys.
//
// Both call into the same pure function (pollTick) so the orchestration
// stays in one place. Auth + transport are the only things this route
// is responsible for.
//
// Auth: a shared CRON_SECRET header. Missing/wrong secret → 401. The
// secret is set on Railway via `railway variables`; rotating it is an
// env-var redeploy. Even though cron-job.org no longer calls this on
// a schedule, the auth gate stays — it's HTTP-exposed.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600; // 10 min, matches pollTick's MAX_BUDGET_MS

export async function POST(req: Request) {
  return handle(req);
}

// GET supported so the simplest "hit this URL" cron command shape works.
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
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const summary = await pollTick();
  return NextResponse.json({ ok: true, ...summary });
}
