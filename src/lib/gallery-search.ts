import "server-only";
import { prisma } from "@/lib/prisma";
import {
  sanitizeLLMText,
  MAX_CAPTION_CHARS,
  MAX_ORIGIN_TEXT_CHARS,
} from "@/lib/sanitize";

// Shared gallery full-text search. Two callers:
//   1. /gallery page (server component, ranks ids then hydrates with
//      additional filters on top — origin / tag / by).
//   2. gallery_search agent tool (no additional filters; returns a
//      pre-formatted sanitized text blob for a tool_result block).
//
// Both hit the same media_search_tsv(...) IMMUTABLE wrapper in Postgres,
// so behavior stays identical — what a member sees in the grid is what
// an agent finds through the tool. Divergence between UI search and
// agent search is a debugging nightmare waiting to happen.
//
// Sanitation: this file is the ONLY path through which scraped origin
// text (originTitle / originAuthor) reaches the Sonnet context, so
// every string that flows out of it must pass through sanitizeLLMText.
// Test this invariant in the prompt-injection eval (todo #14).

export type GallerySearchHit = {
  id: string;
  url: string;
  sourceUrl: string | null;
  origin: string;
  caption: string | null;
  originTitle: string | null;
  originAuthor: string | null;
  uploaderDisplayName: string;
  createdAt: Date;
};

/**
 * Run the FTS GIN index for a query and return a ranked id list.
 *
 * Callers that need extra WHERE predicates (origin/tag/uploader) should
 * hydrate via a separate prisma.findMany where-clause and re-sort by
 * the returned rank. Callers that just want results end-to-end should
 * use `searchGallery` or `searchGalleryForAgent` below.
 */
export async function searchGalleryIds(
  query: string,
  limit: number,
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Media"
    WHERE status = 'READY'::"MediaStatus"
      AND "hiddenFromGrid" = false
      AND media_search_tsv("caption", "originTitle", "originAuthor", "tags")
          @@ plainto_tsquery('english', ${trimmed})
    ORDER BY "hallOfFame" DESC, "createdAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

/**
 * End-to-end search: FTS + hydration with uploader displayName.
 * Returns hits in rank order, already sanitized at the fields that
 * flow into LLM prompts (caption / originTitle / originAuthor).
 */
export async function searchGallery(
  query: string,
  limit = 6,
): Promise<GallerySearchHit[]> {
  const ids = await searchGalleryIds(query, limit);
  if (ids.length === 0) return [];

  const rows = await prisma.media.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      url: true,
      sourceUrl: true,
      origin: true,
      caption: true,
      originTitle: true,
      originAuthor: true,
      createdAt: true,
      uploadedBy: { select: { displayName: true } },
    },
  });

  // Preserve FTS rank order.
  const rank = new Map(ids.map((id, i) => [id, i] as const));
  rows.sort(
    (a, b) =>
      (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length),
  );

  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    sourceUrl: r.sourceUrl,
    origin: r.origin,
    caption: sanitizeLLMText(r.caption, MAX_CAPTION_CHARS),
    originTitle: sanitizeLLMText(r.originTitle, MAX_ORIGIN_TEXT_CHARS),
    originAuthor: sanitizeLLMText(r.originAuthor, MAX_ORIGIN_TEXT_CHARS),
    uploaderDisplayName: r.uploadedBy.displayName,
    createdAt: r.createdAt,
  }));
}

/**
 * Shape a search result as the `content` string for a client-managed
 * `tool_result` block. Sonnet will summarize / riff on this blob when
 * composing its reply. Empty / no-match queries return a short
 * descriptive message rather than an empty string so the model doesn't
 * silently hallucinate fallback behavior.
 */
export async function searchGalleryForAgent(
  query: string,
  limit = 6,
): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    return "gallery_search: empty query — ask the user what they're looking for.";
  }

  const hits = await searchGallery(trimmed, limit);
  if (hits.length === 0) {
    return `gallery_search("${truncateForLog(trimmed, 80)}"): no matches.`;
  }

  // Every string that lands in the tool_result runs through the sanitizer —
  // not just the ones that came from scraped sources. security-sentinel
  // flagged sourceUrl + uploaderDisplayName as unsanitized echo paths
  // (a pasted URL whose query string contains "#+SYSTEM+override" would
  // flow verbatim into the next turn). displayName is admin-curated today
  // but we enforce the invariant server-side rather than trust it.
  const lines = hits.map((h, i) => {
    const headline =
      sanitizeLLMText(h.caption, MAX_CAPTION_CHARS) ??
      sanitizeLLMText(h.originTitle, MAX_ORIGIN_TEXT_CHARS) ??
      "(no caption)";
    const author = sanitizeLLMText(h.originAuthor, MAX_ORIGIN_TEXT_CHARS);
    const byline = author ? ` — ${author}` : "";
    const uploader =
      sanitizeLLMText(h.uploaderDisplayName, MAX_ORIGIN_TEXT_CHARS) ??
      "unknown";
    const linkRaw = h.sourceUrl ?? h.url;
    const link = sanitizeLLMText(linkRaw, 300) ?? "(link unavailable)";
    return `${i + 1}. ${headline}${byline} (shared by ${uploader}, ${h.origin}). ${link}`;
  });

  return [
    `gallery_search("${truncateForLog(trimmed, 80)}") — ${hits.length} result${hits.length === 1 ? "" : "s"}:`,
    ...lines,
  ].join("\n");
}

function truncateForLog(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
