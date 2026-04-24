import "server-only";
import Parser from "rss-parser";
import { Prisma } from "@prisma/client";
import type { Feed } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeFetch, UnsafeUrlError } from "@/lib/safe-fetch";
import { ingestUrl, IngestError } from "@/lib/ingest";
import { persistIngest } from "@/lib/ingest/persist";
import {
  normalizeUrl,
  type PollOutcome,
  type PollError,
} from "@/lib/feed-types";

// Core poll loop for a single Feed.
//
// Called by the 15-min poll cron (PR B) over a batch and by the admin
// "Poll now" action (PR B — single feed, rate-limited). Network I/O
// happens OUTSIDE the per-feed advisory lock so a slow upstream can't
// wedge concurrent pollers against the same row.
//
// Failure handling philosophy:
//   - fetch/parse errors → `failure` outcome, exponential backoff,
//     breaker trips at 5 consecutive failures.
//   - per-item write errors → accumulated into a `partial` outcome;
//     the feed itself isn't considered broken.
//   - per-feed advisory lock held elsewhere → `skipped: locked`.
//   - window hasn't elapsed → `skipped: too-soon` (no log row).
//
// The rss-parser library is only a *parser* here. We do the fetch
// ourselves via safeFetch so the SSRF guards + byte caps + per-call
// timeout still apply. Passing rss-parser a URL would bypass all of
// that.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS_PER_POLL = 50;
const ERROR_MESSAGE_CAP = 2000;
const BREAKER_THRESHOLD = 5;
const BACKOFF_MAX_MIN = 24 * 60;
const UA = "LazyRiverBot/1.0 (+https://lazyriver.co)";

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
    ],
  },
});

type RawItem = Parser.Item & {
  contentEncoded?: string;
  mediaThumbnail?: { $?: { url?: string } };
  mediaContent?: { $?: { url?: string } };
};

// ---------------------------------------------------------------------------
// Entry point

export async function pollFeed(feedId: string): Promise<PollOutcome> {
  const startedAt = new Date();

  // Cheap early-exit: don't take the lock if we know the window hasn't
  // elapsed. Re-checked inside the transaction to close the race.
  const preview = await prisma.feed.findUnique({
    where: { id: feedId },
    select: {
      enabled: true,
      autoDisabledAt: true,
      nextPollEligibleAt: true,
    },
  });
  if (!preview) {
    return failure(startedAt, { stage: "fetch", message: `Feed ${feedId} not found` });
  }
  if (!preview.enabled || preview.autoDisabledAt) {
    return { outcome: "skipped", reason: "too-soon" };
  }
  if (notYetEligible(preview.nextPollEligibleAt)) {
    return { outcome: "skipped", reason: "too-soon" };
  }

  // Tiny transaction: SELECT FOR UPDATE SKIP LOCKED → set lastPolledAt
  // to now() and nextPollEligibleAt to now() + pollIntervalMin. Holding
  // the lease for only the lifetime of this tx keeps the row available
  // for admin edits (name/URL rotation) during the network I/O phase.
  // If the process dies mid-poll, nextPollEligibleAt is already pushed
  // forward, so the next tick won't re-fire against this feed within
  // the window. lastPolledAt stays observationally accurate — it's
  // when we actually started a poll, not a gate.
  const leased = await leaseFeed(feedId);
  if (!leased) return { outcome: "skipped", reason: "locked" };

  try {
    return await runPoll(leased, startedAt);
  } catch (e) {
    // Defense in depth — runPoll returns PollOutcome for every known
    // failure; reaching here means something threw unexpectedly.
    const message = e instanceof Error ? e.message : String(e);
    await recordFailure(leased, message.slice(0, ERROR_MESSAGE_CAP));
    return failure(startedAt, { stage: "fetch", message });
  }
}

// ---------------------------------------------------------------------------
// Lease

async function leaseFeed(feedId: string): Promise<Feed | null> {
  // Plain Prisma doesn't expose FOR UPDATE SKIP LOCKED, so use a raw
  // query inside a tx. Returning `rows` typed via $queryRaw gives us
  // the same Feed shape. Follow-up: generic helper in @/lib/prisma for
  // this idiom once we have a second caller.
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Feed[]>(
      Prisma.sql`SELECT * FROM "Feed" WHERE id = ${feedId} FOR UPDATE SKIP LOCKED`,
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    // Re-check inside the lock — another worker could have polled us
    // between the preview read and the lease acquisition.
    if (notYetEligible(row.nextPollEligibleAt)) return null;

    const now = new Date();
    const nextEligible = new Date(
      now.getTime() + row.pollIntervalMin * 60 * 1000,
    );
    await tx.feed.update({
      where: { id: feedId },
      data: { lastPolledAt: now, nextPollEligibleAt: nextEligible },
    });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Poll (network + parse + write)

async function runPoll(feed: Feed, startedAt: Date): Promise<PollOutcome> {
  let body: string;
  try {
    body = await fetchFeedBody(feed.url);
  } catch (e) {
    const message =
      e instanceof UnsafeUrlError || e instanceof Error ? e.message : String(e);
    await recordFailure(feed, message.slice(0, ERROR_MESSAGE_CAP));
    const err: PollError = {
      stage: "fetch",
      message: message.slice(0, ERROR_MESSAGE_CAP),
      sourceUrl: feed.url,
    };
    await writeLog(feed.id, startedAt, "failure", { errors: [err] });
    return failure(startedAt, err);
  }

  let parsed;
  try {
    parsed = await parser.parseString(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordFailure(feed, message.slice(0, ERROR_MESSAGE_CAP));
    const err: PollError = {
      stage: "parse",
      message: message.slice(0, ERROR_MESSAGE_CAP),
      sourceUrl: feed.url,
    };
    await writeLog(feed.id, startedAt, "failure", { errors: [err] });
    return failure(startedAt, err);
  }

  const items = (parsed.items ?? []).slice(0, MAX_ITEMS_PER_POLL);
  const writeResult =
    feed.kind === "NEWS"
      ? await writeNewsItems(feed, items)
      : await writeMediaItems(feed, items);

  const { inserted, errors, latestAt } = writeResult;
  // skipped = items the poller saw but didn't insert into the DB, for
  // any reason (duplicates, malformed entries without a link, per-item
  // write failures). `errors` is the separate diagnostic channel —
  // items may appear in both counts.
  const skippedCount = items.length - inserted;

  // Only advance lastItemAt when we actually inserted new rows.
  // Otherwise a feed that keeps returning the same N cached items
  // would look HEALTHY forever and never trip the STALE check.
  await recordSuccess(feed, inserted > 0 ? latestAt : null);

  const durationMs = Date.now() - startedAt.getTime();
  if (errors.length > 0) {
    await writeLog(feed.id, startedAt, "partial", {
      inserted,
      skipped: skippedCount,
      errors,
    });
    return {
      outcome: "partial",
      inserted,
      skipped: skippedCount,
      errors,
      durationMs,
    };
  }

  await writeLog(feed.id, startedAt, "success", {
    inserted,
    skipped: skippedCount,
  });
  return { outcome: "success", inserted, skipped: skippedCount, durationMs };
}

// ---------------------------------------------------------------------------
// Fetch

async function fetchFeedBody(url: string): Promise<string> {
  const res = await safeFetch(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.1",
    userAgent: UA,
  });
  // Cap response size — a malicious or misconfigured feed that streams
  // forever shouldn't be able to pin our memory.
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) {
    throw new Error(`Feed body exceeds ${MAX_FEED_BYTES} bytes`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Writers

type WriteResult = {
  inserted: number;
  errors: PollError[];
  /**
   * Newest publishedAt across attempted inserts; caller decides
   * whether to apply it (only when inserted > 0, to avoid drift on
   * feeds that keep returning unchanged cached items).
   */
  latestAt: Date | null;
};

async function writeNewsItems(
  feed: Feed,
  items: RawItem[],
): Promise<WriteResult> {
  const rows: Array<{
    feedId: string;
    sourceUrl: string;
    originalUrl: string;
    guid: string | null;
    title: string;
    excerpt: string | null;
    author: string | null;
    publishedAt: Date | null;
    ogImageUrl: string | null;
  }> = [];
  const errors: PollError[] = [];
  // The "latest item" candidate across everything we tried to insert.
  // Only passed up to recordSuccess if createMany reports inserted > 0
  // — caller gates on that so this value is safe to compute eagerly.
  let latestAt: Date | null = null;

  for (const item of items) {
    try {
      const link = item.link?.trim();
      if (!link) {
        errors.push({ stage: "parse", message: "Item missing link" });
        continue;
      }
      const sourceUrl = normalizeUrl(link);
      const publishedAt = parsePubDate(item.isoDate ?? item.pubDate);
      rows.push({
        feedId: feed.id,
        sourceUrl,
        originalUrl: link,
        guid: item.guid?.trim() || null,
        title: (item.title?.trim() || "Untitled").slice(0, 500),
        excerpt: (item.contentSnippet ?? item.summary ?? null)?.slice(0, 1000) ?? null,
        author: item.creator?.trim() || null,
        publishedAt,
        ogImageUrl: extractImage(item),
      });
      const bucket = publishedAt ?? new Date();
      if (!latestAt || bucket > latestAt) latestAt = bucket;
    } catch (e) {
      errors.push({
        stage: "parse",
        message: (e instanceof Error ? e.message : String(e)).slice(
          0,
          ERROR_MESSAGE_CAP,
        ),
      });
    }
  }

  if (rows.length === 0) {
    return { inserted: 0, errors, latestAt: null };
  }

  // createMany + skipDuplicates handles both the sourceUrl unique
  // collision AND the (feedId, guid) unique collision atomically. We
  // don't need a per-item try/catch in the common path.
  const result = await prisma.newsItem.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return {
    inserted: result.count,
    errors,
    latestAt,
  };
}

async function writeMediaItems(
  feed: Feed,
  items: RawItem[],
): Promise<WriteResult> {
  let inserted = 0;
  const errors: PollError[] = [];
  let latestAt: Date | null = null;

  for (const item of items) {
    const link = item.link?.trim();
    if (!link) {
      errors.push({ stage: "parse", message: "Item missing link" });
      continue;
    }
    const normalized = normalizeUrl(link);

    // Idempotency: if this feed already has a Media row with the same
    // sourceUrl, skip. ingestUrl is the expensive step (OG scrape + R2
    // copy) — checking first saves work. The unique index on
    // Media(feedId, sourceUrl) is the real backstop for the race
    // between two crashed-and-restarted pollers.
    const existing = await prisma.media.findFirst({
      where: { feedId: feed.id, sourceUrl: normalized },
      select: { id: true },
    });
    if (existing) continue;

    try {
      const ingest = await ingestUrl(link);
      await persistIngest(ingest, {
        kind: "feed",
        feedId: feed.id,
        uploadedById: feed.ownerId,
      });
      inserted++;
      const published = parsePubDate(item.isoDate ?? item.pubDate) ?? new Date();
      if (!latestAt || published > latestAt) latestAt = published;
    } catch (e) {
      const message =
        e instanceof IngestError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      // Prisma P2002 on the new (feedId, sourceUrl) unique index is
      // "another poller won the race" — not an error worth alerting on.
      if (isPrismaUniqueViolation(e)) continue;
      errors.push({
        stage: "write",
        message: message.slice(0, ERROR_MESSAGE_CAP),
        sourceUrl: link,
      });
    }
  }

  return { inserted, errors, latestAt };
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: unknown }).code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// Feed state updates

async function recordSuccess(feed: Feed, latestAt: Date | null): Promise<void> {
  const now = new Date();
  await prisma.feed.update({
    where: { id: feed.id },
    data: {
      lastSuccessAt: now,
      lastItemAt: latestAt ?? feed.lastItemAt,
      lastError: null,
      consecutivePollFailures: 0,
      // Reset the schedule: next poll happens on the normal cadence.
      // leaseFeed already set nextPollEligibleAt to now+interval; this
      // just ensures the new-item-arrival path doesn't diverge.
    },
  });
}

async function recordFailure(feed: Feed, message: string): Promise<void> {
  const failures = feed.consecutivePollFailures + 1;
  // Exponential backoff on `nextPollEligibleAt` — never touches
  // lastPolledAt, which stays as the observable "when did we last
  // attempt." Capped at 24h so a breaker-tripped-then-re-enabled feed
  // comes back within a reasonable window.
  const backoffMin = Math.min(
    Math.pow(2, failures) * feed.pollIntervalMin,
    BACKOFF_MAX_MIN,
  );
  const nextEligible = new Date(Date.now() + backoffMin * 60 * 1000);
  const breakerTripped = failures >= BREAKER_THRESHOLD;

  await prisma.feed.update({
    where: { id: feed.id },
    data: {
      lastError: message,
      consecutivePollFailures: failures,
      nextPollEligibleAt: nextEligible,
      ...(breakerTripped && !feed.autoDisabledAt
        ? { enabled: false, autoDisabledAt: new Date() }
        : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Log writer

async function writeLog(
  feedId: string,
  startedAt: Date,
  outcome: "success" | "partial" | "failure",
  body: { inserted?: number; skipped?: number; errors?: PollError[] },
): Promise<void> {
  await prisma.feedPollLog.create({
    data: {
      feedId,
      startedAt,
      durationMs: Math.max(0, Date.now() - startedAt.getTime()),
      outcome,
      inserted: body.inserted ?? 0,
      skipped: body.skipped ?? 0,
      errors: body.errors && body.errors.length > 0
        ? (body.errors as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers

function notYetEligible(nextPollEligibleAt: Date | null): boolean {
  if (!nextPollEligibleAt) return false;
  return nextPollEligibleAt.getTime() > Date.now();
}

function parsePubDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  // Reject clearly-bogus dates (epoch 0 from misconfigured feeds,
  // future-by-more-than-a-day which usually means a TZ mishap at the
  // publisher). Keeps the keyset pagination well-behaved.
  const ts = d.getTime();
  if (ts < new Date("2000-01-01").getTime()) return null;
  if (ts > Date.now() + 24 * 60 * 60 * 1000) return null;
  return d;
}

function extractImage(item: RawItem): string | null {
  const fromMedia = item.mediaContent?.$?.url ?? item.mediaThumbnail?.$?.url;
  if (typeof fromMedia === "string" && fromMedia.length > 0) return fromMedia;
  const enclosure = item.enclosure;
  if (enclosure?.url && enclosure.type?.startsWith("image/")) {
    return enclosure.url;
  }
  return null;
}

function failure(startedAt: Date, error: PollError): PollOutcome {
  return {
    outcome: "failure",
    error,
    durationMs: Math.max(0, Date.now() - startedAt.getTime()),
  };
}
