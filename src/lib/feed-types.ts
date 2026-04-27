// Shared types for the automated-feeds subsystem (news RSS + curated
// media feeds). Discriminated unions on purpose: every caller that
// branches on feed-vs-user attribution or news-vs-media item kind
// gets exhaustiveness-checked by the TS narrowing, not a stringly-
// typed if/else ladder. See plans/library-news-and-feeds.md for the
// full context on why each union exists.
//
// This file is pure types — no Prisma imports, no runtime deps — so
// it can be imported from anywhere (server actions, polling cron,
// admin UI) without dragging the client along.
//
// Authored in PR A1 (schema + poller foundation, no UI yet). The
// poller, health lib, and future /admin/memory/feeds routes all pull their
// shapes from here.
//
// Out of scope for this file: the `Media` and `Feed` Prisma types
// themselves (those come from @prisma/client) and the admin-UI
// rendering concerns (health-chip colors, sparkline row shape).

// ---------------------------------------------------------------------------
// Health
//
// DISABLED is split from FAILED on purpose: the first means an admin
// chose to turn the feed off (recoverable by the same admin); the second
// means the poller tripped the N-consecutive-failures breaker and the
// feed will not poll again until a human intervenes. Different mental
// model, different UX treatment in /admin/memory/feeds.

export type FeedHealth =
  | "HEALTHY"
  | "STALE"
  | "DEGRADED"
  | "FAILED"
  | "DISABLED";

// ---------------------------------------------------------------------------
// Ingest attribution
//
// Every call to `persistIngest` declares whether the ingest came from a
// user (paste, share target, bookmarklet) or from a background feed
// poller. `hiddenFromGrid` is derived from `source.kind === "feed"` —
// never passed explicitly. Callers that need to override that default
// should do it by mutating the Media row after `persistIngest` returns,
// not by threading another flag through this union.

export type IngestSource =
  | { kind: "user"; uploadedById: string }
  | { kind: "feed"; feedId: string; uploadedById: string };

// ---------------------------------------------------------------------------
// Feed item reference
//
// Admin actions (promote, hide, delete) operate on a single item that
// lives in one of two tables. This union replaces the (itemId, kind:
// string) pair that we'd otherwise pass around stringly, and keeps the
// caller honest about which table they're addressing.

export type FeedItemRef =
  | { kind: "NEWS"; itemId: string }
  | { kind: "MEDIA"; itemId: string };

// ---------------------------------------------------------------------------
// Poll outcome
//
// One `pollFeed` call returns exactly one `PollOutcome`. The shape is
// the contract between the poller and its callers (cron batch, admin
// "Poll now" action, observability writer). The four variants map to
// the `outcome` text column on FeedPollLog.
//
// - success: fetched, parsed, wrote ≥0 items, no errors.
// - partial: fetched, parsed, wrote some items, hit at least one non-
//   fatal error (a single item failed to insert, e.g.).
// - failure: a fatal error — usually fetch/parse — stopped the poll
//   before any items were written.
// - skipped: the per-feed advisory lock was already held by another
//   worker, OR the poll window has not yet elapsed. No work done, no
//   log row written for the `too-soon` variant (we only record the
//   `locked` skip so cron-overlap diagnostics are possible).

export type PollOutcome =
  | {
      outcome: "success";
      inserted: number;
      skipped: number;
      durationMs: number;
    }
  | {
      outcome: "partial";
      inserted: number;
      skipped: number;
      errors: PollError[];
      durationMs: number;
    }
  | { outcome: "failure"; error: PollError; durationMs: number }
  | { outcome: "skipped"; reason: "locked" | "too-soon" };

export type PollError = {
  stage: "fetch" | "parse" | "write" | "rate-limit";
  /** Trimmed to 2000 chars at persist time — a full HTML error page should never land in a text column. */
  message: string;
  sourceUrl?: string;
};

// ---------------------------------------------------------------------------
// Beta feature gate
//
// `User.betaFeatures` is a Postgres text[] column with a GIN index. The
// allowed values are this literal tuple; anything else is a migration
// bug. Add values here + update the UI that writes them; no migration
// needed to extend.

export const BETA_FEATURES = ["news"] as const;
export type BetaFeature = (typeof BETA_FEATURES)[number];

// Narrow pick so callers don't have to import `User` just to run the gate.
export function hasBetaFeature(
  user: { betaFeatures: string[] } | null | undefined,
  f: BetaFeature,
): boolean {
  return !!user && user.betaFeatures.includes(f);
}

// ---------------------------------------------------------------------------
// URL normalization
//
// The NewsItem dedupe key is the normalized URL. Applied BEFORE insert,
// BEFORE uniqueness check. Idempotent — normalize(normalize(x)) === normalize(x).
//
// Rules:
//  - force https
//  - lowercase host, strip leading www.
//  - drop fragment
//  - drop known tracking params (utm_*, fbclid, gclid, mc_*, ref, _ga)
//  - strip trailing slash on non-root paths
//
// Kept here (not in src/lib/feed-poller.ts) because the admin "promote
// news to library" action needs to re-normalize the same way to hit the
// same unique constraint.

const TRACKING_PARAM = /^(utm_|fbclid|gclid|mc_cid|mc_eid|_ga|ref$)/i;

export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const k of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  }
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}
