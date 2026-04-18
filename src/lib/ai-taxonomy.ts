import "server-only";
import { prisma } from "@/lib/prisma";
import { BANNED_LABEL } from "@/lib/taxonomy-constants";
export { BANNED_LABEL } from "@/lib/taxonomy-constants";

// Controlled-vocabulary hints for Gemini vision tagging. Two semantics
// in one table:
//
// - Preferred buckets (people / places / topics / vibes) — "use these
//   slugs verbatim when applicable." Soft pressure. The model can still
//   emit anything else it thinks fits.
// - Banned bucket (label = BANNED_LABEL) — "never emit these." Hard
//   pressure in the prompt + a server-side backstop in ai-tagging.ts
//   that strips any banned slug from the model's JSON before persist.
//
// Buckets live in TaxonomyBucket; admin edits via /admin/taxonomy.
// Phrasing of the preferred block avoids "MUST use" — that triggered
// refusals in smoke-testing when the canon didn't match the image.
// "Prefer when applicable" is the right pressure level.
//
// Caching: process-local, 60s TTL, shared across preferred + banned
// reads since they come from the same SELECT. Admin writes invalidate
// via invalidateTaxonomyCache(); other Next processes behind Railway's
// LB pick up within the TTL. `getBannedSlugs()` is the backstop API —
// it always returns a fresh read of the cached state so `ai-tagging.ts`
// can filter the model's response with zero risk of racing a cache
// that hasn't been primed yet.

const CACHE_TTL_MS = 60_000;

type BucketRow = { label: string; slugs: string[] };
type CacheEntry = {
  hint: string;
  banned: Set<string>;
  expiresAt: number;
};

let _cache: CacheEntry | null = null;

async function loadCache(): Promise<CacheEntry> {
  const now = Date.now();
  if (_cache && _cache.expiresAt > now) return _cache;

  const rows = await prisma.taxonomyBucket.findMany({
    orderBy: { sortOrder: "asc" },
    select: { label: true, slugs: true },
  });
  const bannedRow = rows.find((r) => r.label === BANNED_LABEL);
  const banned = new Set<string>(bannedRow?.slugs ?? []);
  const preferred = rows.filter((r) => r.label !== BANNED_LABEL);
  const hint = renderHint(preferred, bannedRow?.slugs ?? []);

  _cache = { hint, banned, expiresAt: now + CACHE_TTL_MS };
  return _cache;
}

/**
 * Returns the taxonomy-hint block for injection into SYSTEM_INSTRUCTION,
 * or an empty string when every bucket is empty. Called once per Gemini
 * vision call.
 */
export async function buildTaxonomyHint(): Promise<string> {
  return (await loadCache()).hint;
}

/**
 * Returns the set of slugs the model must never emit. Called by
 * `parseAndCleanTags` in ai-tagging.ts + `parseTags` / `bulkTagAction`
 * as a server-side backstop to the prompt-level ban — models and admins
 * both occasionally try to reintroduce banned tags.
 *
 * Return type is `ReadonlySet` because the returned value is the
 * cache's live Set reference, not a copy. A mutating caller would
 * poison every subsequent caller until the next TTL. `ReadonlySet`
 * removes `.add`/`.delete`/`.clear` from the type surface so TS
 * catches the mistake at compile time. Zero runtime cost.
 */
export async function getBannedSlugs(): Promise<ReadonlySet<string>> {
  return (await loadCache()).banned;
}

/**
 * Invalidate the process-local cache. Called by admin write actions so
 * the next vision call picks up the edit without waiting for the TTL.
 */
export function invalidateTaxonomyCache(): void {
  _cache = null;
}

function renderHint(preferred: BucketRow[], banned: string[]): string {
  const nonEmptyPreferred = preferred.filter((r) => r.slugs.length > 0);
  const hasBanned = banned.length > 0;
  if (nonEmptyPreferred.length === 0 && !hasBanned) return "";

  const sections: string[] = [""];

  if (nonEmptyPreferred.length > 0) {
    sections.push(
      "Preferred vocabulary — when any of the following slugs applies, use it verbatim instead of a synonym. You may still add other tags outside this list.",
      ...nonEmptyPreferred.map(
        (r) => `- ${r.label}: ${r.slugs.join(", ")}`,
      ),
    );
  }

  if (hasBanned) {
    if (nonEmptyPreferred.length > 0) sections.push("");
    sections.push(
      "Forbidden tags — NEVER emit any of the following, even if they seem to apply. If one would have been a good fit, either omit it or substitute a different descriptive tag:",
      `- ${banned.join(", ")}`,
    );
  }

  return sections.join("\n");
}
