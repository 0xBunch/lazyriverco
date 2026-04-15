// Per-user sliding-window rate limiter backed by the RateLimitHit table
// (added in Task 1 of the lazy-river phase 1 refactor). Ships as a no-op
// in Task 0 so the module can exist before the migration runs; Task 3
// flips RATE_LIMIT_ENABLED to true and fills in the real Prisma query
// after the table lands.
//
// Design: DB-backed rolling windows (per-minute + per-day) with one row
// per hit. Phase-1 scale (< 10 users) makes row count trivial; a periodic
// DELETE for rows older than 24h gets added in Task 3 alongside the real
// implementation.

export type RateLimitBucket =
  | "conversation.create"
  | "conversation.message";

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

// Feature flag. Flipped to `true` in Task 3 once the RateLimitHit table
// from Task 1 is live and this module has its Prisma implementation.
// Typed as plain `boolean` (not a `false` literal) so TypeScript doesn't
// eliminate the post-flag branch below as unreachable code.
const RATE_LIMIT_ENABLED: boolean = false;

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
  if (!RATE_LIMIT_ENABLED) {
    // Stub: no backing store exists yet. See header comment.
    return;
  }

  // NOTE: the real implementation queries prisma.rateLimitHit with a
  // window filter and INSERTs a new hit if under the caps. Stubbed here
  // so referencing the params keeps TypeScript happy without pulling
  // in the Prisma client model that Task 1 hasn't generated yet.
  console.debug(
    `[rate-limit] would check ${bucket} for user ${userId}: ${options.maxPerMinute}/min, ${options.maxPerDay}/day`,
  );
}
