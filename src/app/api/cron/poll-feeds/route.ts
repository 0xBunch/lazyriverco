import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pollFeed } from "@/lib/feed-poller";

// Cron entrypoint. Hit every 15 min by a Railway cron service (wire
// via Railway UI: command `curl -H "x-cron-secret: $CRON_SECRET"
// https://lazyriver.co/api/cron/poll-feeds`). Single-shot endpoint —
// no retries, no queue. Failures surface in FeedPollLog.
//
// Concurrency shape:
//   - The whole tick is bounded to 10 minutes via the perFeedTimeout
//     per-feed wrapper + MAX_BUDGET_MS overall. Past that budget we
//     stop issuing new pollFeed calls; in-flight ones finish on their
//     own.
//   - Concurrency across feeds is capped at CONCURRENCY (5). Each
//     pollFeed call already serializes its own work against a
//     per-feed advisory lock, so we can't double-poll the same feed
//     even if scheduler windows overlap.
//
// Auth: a shared CRON_SECRET header. Missing/wrong secret → 401. The
// secret is set on Railway via `railway variables`; the cron curl is
// configured there too. Rotating the secret is an env-var redeploy.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONCURRENCY = 5;
const MAX_BUDGET_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  return handle(req);
}

// GET supported so the Railway cron UI's "hit this URL" shape works
// with the simplest command. Same auth, same work.
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

  const startedAt = Date.now();

  // Only pick up feeds that are (a) enabled, (b) not breaker-tripped,
  // and (c) past their next-eligible gate. The eligibility check lets
  // a backed-off feed stay quiet for the full backoff window even if
  // the cron fires more often than the feed's pollIntervalMin.
  const candidates = await prisma.feed.findMany({
    where: {
      enabled: true,
      autoDisabledAt: null,
      OR: [
        { nextPollEligibleAt: null },
        { nextPollEligibleAt: { lte: new Date() } },
      ],
    },
    select: { id: true },
  });

  const summary = { attempted: 0, success: 0, partial: 0, failure: 0, skipped: 0 };
  const queue = candidates.map((c) => c.id);
  const workers = Array.from({ length: CONCURRENCY }, () => drain());

  async function drain() {
    while (queue.length > 0) {
      if (Date.now() - startedAt > MAX_BUDGET_MS) return;
      const id = queue.shift();
      if (!id) return;
      summary.attempted++;
      try {
        const outcome = await pollFeed(id);
        if (outcome.outcome === "success") summary.success++;
        else if (outcome.outcome === "partial") summary.partial++;
        else if (outcome.outcome === "failure") summary.failure++;
        else summary.skipped++;
      } catch (e) {
        // pollFeed's own try/catch should keep us from reaching here,
        // but a bug inside it shouldn't take down the whole tick.
        console.error("cron poll-feeds error", id, e);
        summary.failure++;
      }
    }
  }

  await Promise.all(workers);

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    elapsedMs: Date.now() - startedAt,
    ...summary,
  });
}
