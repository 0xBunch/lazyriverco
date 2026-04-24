// Feed health — derived from poll metadata, never stored.
//
// `computeHealth` is a pure function of the Feed row's observable
// state (lastPolledAt, lastSuccessAt, lastItemAt, consecutivePollFailures,
// autoDisabledAt, enabled, pollIntervalMin). No DB reads, no side
// effects — trivially testable and cheap to call on every render.
//
// Storing health as a column invites drift. If the chip says HEALTHY
// and the log says FAILED, users stop trusting the dashboard. Derive
// on read; the inputs are all on the row already.

import type { FeedHealth } from "@/lib/feed-types";

export type FeedHealthInputs = {
  enabled: boolean;
  pollIntervalMin: number;
  lastPolledAt: Date | null;
  lastSuccessAt: Date | null;
  lastItemAt: Date | null;
  consecutivePollFailures: number;
  autoDisabledAt: Date | null;
};

const STALE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MIN = 60 * 1000;

/**
 * Map a Feed's observable state onto one of five health categories.
 *
 * Priority order (first match wins):
 *  1. FAILED    — auto-disabled by the breaker; admin must re-enable.
 *  2. DISABLED  — admin turned it off manually.
 *  3. DEGRADED  — 1-4 consecutive failures (within the breaker window).
 *  4. STALE     — polls succeeding, but no new items in 30+ days.
 *  5. HEALTHY   — polled recently (≤ 2× interval), items in last 30 days.
 *
 * The "no recent success" edge case (lastPolledAt set but lastSuccessAt
 * null or long-stale) is captured by STALE when failures == 0 — a feed
 * that polls fine but never publishes is stale, not degraded.
 */
export function computeHealth(
  f: FeedHealthInputs,
  now: Date = new Date(),
): FeedHealth {
  if (f.autoDisabledAt) return "FAILED";
  if (!f.enabled) return "DISABLED";
  if (f.consecutivePollFailures > 0) return "DEGRADED";

  const staleCutoff = now.getTime() - STALE_DAYS * MS_PER_DAY;
  const lastItemTs = f.lastItemAt?.getTime() ?? null;
  if (lastItemTs !== null && lastItemTs < staleCutoff) return "STALE";

  // Never-polled or never-succeeded with zero failures means the feed
  // was just added — treat as STALE until the first success arrives so
  // the admin sees a yellow chip instead of a misleading green.
  if (f.lastSuccessAt === null) return "STALE";

  const recencyCutoff = now.getTime() - f.pollIntervalMin * 2 * MS_PER_MIN;
  if (f.lastSuccessAt.getTime() < recencyCutoff) return "STALE";

  return "HEALTHY";
}
