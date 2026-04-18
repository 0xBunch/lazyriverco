// Per-user sliding-window rate limiter backed by the RateLimitHit table.
// Task 2 wrote the real Prisma query; Task 3 flips RATE_LIMIT_ENABLED
// to true (below) now that the migration has been applied in production
// and the conversation API routes are about to start calling it.
//
// Design: DB-backed rolling windows (per-minute + per-day) with one row
// per hit. Phase-1 scale (< 10 users) makes row count trivial; periodic
// DELETE of rows older than 24h gets wired up in Task 3.
//
// Race note: two parallel calls could both pass the count check and
// both insert, temporarily exceeding the cap by 1. Benign at phase-1
// scale — production-grade would use a Postgres advisory lock or a
// unique partial index on (userId, bucket, minute-bucket).

import { prisma } from "@/lib/prisma";

export type RateLimitBucket =
  | "conversation.create"
  | "conversation.message"
  // Library v1 buckets. Presign guards R2 storage spend (runaway upload
  // loops); ingest guards outbound fetch against arbitrary URLs. Both
  // apply to every signed-in member, not just admin.
  | "media.presign"
  | "library.ingest"
  // Library v1.2 — comments. Generous cap for a 7-user clubhouse; the
  // point is to catch an accidental submit-loop, not to police speech.
  | "library.comment"
  // Library v1.3 — vision auto-tagging runs inline inside the ingest /
  // meta-update actions. Same per-user cap as library.ingest since it
  // fires once per newly-saved item.
  | "library.ai-tag"
  // Admin avatar uploads. Tight cap — agents are ~a dozen entities
  // total; a legitimate admin should never trip this. Firing = stolen
  // cookie burning R2 egress.
  | "avatars.presign";

export type RateLimitOptions = {
  maxPerMinute: number;
  maxPerDay: number;
};

export class RateLimitError extends Error {
  readonly bucket: RateLimitBucket;
  readonly retryAfterSeconds: number;

  constructor(bucket: RateLimitBucket, retryAfterSeconds: number) {
    super(`Rate limit exceeded for ${bucket}`);
    this.name = "RateLimitError";
    this.bucket = bucket;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Feature flag. Flipped to `true` in Task 3 now that the RateLimitHit
// table is live in production. Flip back to false in an emergency if
// the counter ever starts throwing on legitimate traffic — but the
// phase-1 caps (10 conversation.create/min + 30 conversation.message/min
// per user) are generous enough for the crew that this shouldn't fire
// under normal use. Typed as plain `boolean` so TypeScript doesn't
// narrow the guarded branch as unreachable code.
const RATE_LIMIT_ENABLED: boolean = true;

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Throws RateLimitError if the user has exceeded either the per-minute
 * or per-day cap for the given bucket. No-op until RATE_LIMIT_ENABLED
 * is flipped in Task 3.
 *
 * Task 3 call sites:
 *   - POST /api/conversations             → "conversation.create"
 *   - POST /api/conversations/[id]/messages → "conversation.message"
 *
 * Both routes catch RateLimitError and return 429 with Retry-After.
 */
export async function assertWithinLimit(
  userId: string,
  bucket: RateLimitBucket,
  options: RateLimitOptions,
): Promise<void> {
  if (!RATE_LIMIT_ENABLED) return;

  const now = new Date();
  const minuteAgo = new Date(now.getTime() - ONE_MINUTE_MS);
  const dayAgo = new Date(now.getTime() - ONE_DAY_MS);

  // Count in both windows in parallel — one Prisma round trip each.
  const [minuteCount, dayCount] = await Promise.all([
    prisma.rateLimitHit.count({
      where: { userId, bucket, createdAt: { gte: minuteAgo } },
    }),
    prisma.rateLimitHit.count({
      where: { userId, bucket, createdAt: { gte: dayAgo } },
    }),
  ]);

  if (minuteCount >= options.maxPerMinute) {
    throw new RateLimitError(bucket, 60);
  }
  if (dayCount >= options.maxPerDay) {
    // Retry-after: seconds until the oldest hit in the day window rolls off.
    const oldestInWindow = await prisma.rateLimitHit.findFirst({
      where: { userId, bucket, createdAt: { gte: dayAgo } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const retryAfterSeconds = oldestInWindow
      ? Math.max(
          1,
          Math.ceil(
            (ONE_DAY_MS - (now.getTime() - oldestInWindow.createdAt.getTime())) /
              1000,
          ),
        )
      : 3600;
    throw new RateLimitError(bucket, retryAfterSeconds);
  }

  // Passed both windows — record the hit.
  await prisma.rateLimitHit.create({
    data: { userId, bucket },
  });
}
