import "server-only";
import { prisma } from "@/lib/prisma";

// Controlled-vocabulary hints for Gemini vision tagging. These aren't
// hard constraints — Gemini still assigns its own tags freely — but when
// one of the listed slugs fits, the model strongly prefers it over a
// synonym. Keeps the tag cloud coherent ("chicago-bears" vs "bears",
// "nfl-bears", "da-bears"; "vegas" vs "las-vegas"; etc).
//
// Buckets live in the TaxonomyBucket Postgres table — the admin edits
// them via /admin/taxonomy. Phrasing in the prompt deliberately avoids
// "MUST use these" — that triggered refusals in smoke-testing on images
// the model couldn't map onto the canon. "Prefer these slugs when
// applicable" is the right pressure level.
//
// Caching: process-local, 60s TTL. Every ingest / upload / re-analyze
// calls buildTaxonomyHint() once, and a backfill sweep can fire dozens
// of calls in a minute — hitting the DB on each would be wasted work.
// Admin edits take up to 60s to propagate, which is fine for a tagging
// hint. The alternative (cache-bust on write) adds a moving part we
// don't need at this scale.

const CACHE_TTL_MS = 60_000;

type BucketRow = { label: string; slugs: string[] };
type Cache = { hint: string; expiresAt: number };

let _cache: Cache | null = null;

/**
 * Returns the taxonomy-hint block for injection into SYSTEM_INSTRUCTION,
 * or an empty string when every bucket is empty (no hint = fully open
 * vocabulary; the v1.3 ship behavior).
 */
export async function buildTaxonomyHint(): Promise<string> {
  const now = Date.now();
  if (_cache && _cache.expiresAt > now) return _cache.hint;

  const rows = await prisma.taxonomyBucket.findMany({
    orderBy: { sortOrder: "asc" },
    select: { label: true, slugs: true },
  });
  const hint = renderHint(rows);
  _cache = { hint, expiresAt: now + CACHE_TTL_MS };
  return hint;
}

/**
 * Invalidate the process-local cache. Called by admin write actions so
 * the next vision call picks up the edit without waiting for the TTL.
 * Other Next.js processes behind the Railway load balancer will still
 * hit the 60s TTL — acceptable tradeoff at this scale.
 */
export function invalidateTaxonomyCache(): void {
  _cache = null;
}

function renderHint(rows: BucketRow[]): string {
  const nonEmpty = rows.filter((r) => r.slugs.length > 0);
  if (nonEmpty.length === 0) return "";

  const lines = nonEmpty.map((r) => `- ${r.label}: ${r.slugs.join(", ")}`);
  return [
    "",
    "Preferred vocabulary — when any of the following slugs applies, use it verbatim instead of a synonym. You may still add other tags outside this list.",
    ...lines,
  ].join("\n");
}
