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
// or with synced ones). Per data-integrity-guardian's review, the
// runtime guard below is the load-bearing pin on that contract — if a
// future provider regresses to passing nulls/empties, the upsert path
// would otherwise silently insert a duplicate. Fail loud.

const MAX_ERRORS = 20;

export async function upsertSyncedEvents(
  events: readonly SyncedEvent[],
): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
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
        },
        update: {
          title: ev.title,
          date: dateUtc,
          time: ev.time ?? null,
          description: ev.description ?? null,
          body: ev.body ?? null,
          tags: ev.tags,
          syncedAt: now,
        },
      });
      upserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const tagged = `${ev.source}/${ev.externalId}: ${msg}`;
      // Mirror feed-poller.ts:45 — log to stderr so the failure is visible
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

  return { upserted, errors };
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
