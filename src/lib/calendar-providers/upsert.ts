import "server-only";
import { prisma } from "@/lib/prisma";
import type { SyncedEvent } from "./types";

// Upserts a batch of synced events into CalendarEntry keyed on
// (source, externalId). Errors on individual rows are collected, not
// thrown — one bad event shouldn't kill an entire provider's sync.
//
// Contract: source AND externalId must both be non-empty. Manual
// CalendarEntry rows leave both NULL (Postgres treats them as distinct
// in the unique index, so manual entries don't conflict with each other
// or with synced ones). The runtime guard below is the load-bearing
// pin on that contract — if a future provider regresses to passing
// nulls/empties, the upsert path would otherwise silently insert a
// duplicate. Fail loud.
//
// `feedId` is required (non-null) — every synced row should be
// traceable back to the Feed that produced it. The migration backfill
// guarantees this for legacy rows; new writes set it from the poller.

const MAX_ERRORS = 20;

export type UpsertResult = {
  upserted: number;
  latestAt: Date | null;
  errors: string[];
};

export async function upsertSyncedEvents(
  events: readonly SyncedEvent[],
  feedId: string,
): Promise<UpsertResult> {
  if (!feedId) {
    throw new Error("upsertSyncedEvents: feedId required");
  }
  let upserted = 0;
  let latestAt: Date | null = null;
  const errors: string[] = [];
  let suppressedErrors = 0;
  const now = new Date();

  for (const ev of events) {
    try {
      if (!ev.source || !ev.externalId) {
        throw new Error(
          `synced event missing source/externalId: source=${JSON.stringify(ev.source)} externalId=${JSON.stringify(ev.externalId)}`,
        );
      }
      const dateUtc = parseIsoDateToUtc(ev.date);
      await prisma.calendarEntry.upsert({
        where: {
          source_externalId: {
            source: ev.source,
            externalId: ev.externalId,
          },
        },
        create: {
          title: ev.title,
          date: dateUtc,
          time: ev.time ?? null,
          description: ev.description ?? null,
          body: ev.body ?? null,
          tags: ev.tags,
          recurrence: "none",
          source: ev.source,
          externalId: ev.externalId,
          syncedAt: now,
          feedId,
        },
        update: {
          title: ev.title,
          date: dateUtc,
          time: ev.time ?? null,
          description: ev.description ?? null,
          body: ev.body ?? null,
          tags: ev.tags,
          syncedAt: now,
          // Re-bind feedId on update too — handles the case where a
          // legacy synced row from PR #109 had feedId=NULL and is now
          // being touched by a CALENDAR-feed poll. Backfill SQL covers
          // most of these but defense-in-depth doesn't cost anything.
          feedId,
        },
      });
      upserted++;
      if (latestAt === null || dateUtc > latestAt) {
        latestAt = dateUtc;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const tagged = `${ev.source}/${ev.externalId}: ${msg}`;
      // Mirror feed-poller.ts — log to stderr so the failure is visible
      // in Railway logs even if the cron's JSON response is truncated or
      // never reaches the caller.
      console.error("[calendar-upsert]", tagged);
      if (errors.length < MAX_ERRORS) {
        errors.push(tagged);
      } else {
        suppressedErrors++;
      }
    }
  }

  if (suppressedErrors > 0) {
    errors.push(`+${suppressedErrors} more errors suppressed`);
  }

  return { upserted, latestAt, errors };
}

// "2026-12-25" → Date at UTC midnight, matching @db.Date storage. Avoids
// `new Date("2026-12-25")` because Safari/older Node treat that as UTC
// in some configs and local in others.
function parseIsoDateToUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) {
    throw new Error(`Bad ISO date: ${iso}`);
  }
  return new Date(Date.UTC(y, m - 1, d));
}
