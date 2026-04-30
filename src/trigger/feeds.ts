import { schedules, logger } from "@trigger.dev/sdk";
import { pollTick } from "@/lib/feed-tick";

// Trigger.dev v4 scheduled task: poll RSS feeds every 15 minutes.
// Migrated from the cron-job.org-style `/api/cron/poll-feeds` HTTP
// route. The HTTP route remains as a manual-trigger fallback during
// the migration window; cron-job.org's scheduled hit can be turned
// off once this task runs cleanly for a day.
//
// Architecture note (per the 2026-04-29 plan-time architecture
// review): the actual orchestration logic lives in `src/lib/feed-tick`
// as a pure function. This task is a thin shell so we can swap
// platforms without rewriting the poller. Retry policy is configured
// here at the task level, NOT inside pollTick — pollTick throws,
// Trigger.dev decides whether to retry.
//
// Master kill switch: `FEEDS_SYNC_ENABLED` env var. When OFF (any
// value other than "true"), the task is a no-op and returns
// immediately. This lets us pause polling from Railway env vars
// without redeploying. Defaults to OFF until KB has confirmed the
// Trigger.dev task is running cleanly + has switched cron-job.org
// off.
export const pollFeedsScheduled = schedules.task({
  id: "poll-feeds-scheduled",
  cron: "*/15 * * * *", // every 15 minutes UTC
  // Single retry on transient failure. The orchestration internally
  // bounds at 10 minutes and per-feed advisory locks prevent
  // duplicate work on overlap.
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 30_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
  },
  // Allow up to ~12 min total (Trigger.dev v4 maxDuration is in
  // SECONDS — verified against @trigger.dev/core types). Must stay
  // >= pollTick's internal MAX_BUDGET_MS (10 min) plus DB-write
  // slack. See cross-reference at src/lib/feed-tick.ts.
  maxDuration: 12 * 60,
  run: async () => {
    if (process.env.FEEDS_SYNC_ENABLED !== "true") {
      logger.info("feeds-sync disabled via FEEDS_SYNC_ENABLED env var");
      return { skipped: true, reason: "disabled" };
    }
    const summary = await pollTick();
    logger.info("feeds-sync complete", { ...summary });
    return summary;
  },
});
