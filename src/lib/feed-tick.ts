import "server-only";
import { prisma } from "@/lib/prisma";
import { pollFeed } from "@/lib/feed-poller";

// Feed-poll orchestration logic, extracted from
// src/app/api/cron/poll-feeds/route.ts so it can be called from BOTH:
//   - the existing HTTP route (kept as fallback during the
//     cron-job.org → Trigger.dev migration), AND
//   - the new Trigger.dev scheduled task at src/trigger/feeds.ts.
//
// Pure function: takes no transport-specific args (no Request,
// no headers), returns a serializable summary. The HTTP route is
// responsible for auth (CRON_SECRET); the Trigger.dev task is
// responsible for its own gating (FEEDS_SYNC_ENABLED).
//
// Concurrency shape (preserved from the original handler):
//   - Whole tick bounded to 10 minutes via MAX_BUDGET_MS.
//   - At most CONCURRENCY (5) feeds polled in parallel.
//   - pollFeed() already takes a per-feed advisory lock, so even if
//     two ticks overlap (rare, e.g. cron + manual trigger), we can't
//     double-poll the same feed.

const CONCURRENCY = 5;
const MAX_BUDGET_MS = 10 * 60 * 1000;

export type PollTickSummary = {
  candidates: number;
  attempted: number;
  success: number;
  partial: number;
  failure: number;
  skipped: number;
  elapsedMs: number;
};

export async function pollTick(): Promise<PollTickSummary> {
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

  const summary = {
    attempted: 0,
    success: 0,
    partial: 0,
    failure: 0,
    skipped: 0,
  };
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
        console.error("feed-tick error", id, e);
        summary.failure++;
      }
    }
  }

  await Promise.all(workers);

  return {
    candidates: candidates.length,
    elapsedMs: Date.now() - startedAt,
    ...summary,
  };
}
