import "server-only";
import { prisma } from "@/lib/prisma";

// Retrieval + sanitation seam for the shared media bank section
// buildRichContext injects into agent system prompts.
//
// Phase 1 strategy: hall-of-fame first, then most-recent READY uploads,
// capped at MAX_MEDIA_IN_CONTEXT rows. The `tags` parameter is accepted
// but ignored so future retrieval strategies (tag matching, embeddings)
// can land without changing the call-site signature.
//
// Sanitation (security-sentinel M3, prompt injection): any caption,
// tag, originTitle, or originAuthor that reaches an LLM prompt gets
// stripped of markdown headers, <suggest-agent> sentinels, and control
// characters first. captions are user-written (trusted-ish); originTitle
// and originAuthor are SCRAPED from attacker-controlled pages during
// URL ingest and must never bypass sanitization. The Media table has
// a Prisma-enum `status` column so only READY rows ever reach the LLM
// — PENDING (presign in flight) and DELETED (soft-removed) are filtered.
//
// The sanitizer is exported as `sanitizeLLMText` so the forthcoming
// gallery_search agent tool can run tool_result strings through the
// same primitive before returning them to Sonnet.

const MAX_MEDIA_IN_CONTEXT = 10;
const MAX_CAPTION_CHARS = 200;
const MAX_ORIGIN_TEXT_CHARS = 120;
const MAX_TAGS_PER_ITEM = 20;

export type MediaContextRow = {
  publicUrl: string;
  tags: readonly string[];
  caption: string | null;
  /** Sanitized og:title scraped at ingest — may still describe the asset
   *  when the uploader didn't write a caption. UNTRUSTED origin. */
  originTitle: string | null;
  /** Sanitized og:author / handle / channel — UNTRUSTED origin. */
  originAuthor: string | null;
  hallOfFame: boolean;
};

export type SelectMediaForContextInput = {
  /** Reserved for future tag/embedding retrieval. Accepted + unused in phase 1. */
  characterId: string;
  /** Max rows to return. Defaults to MAX_MEDIA_IN_CONTEXT. */
  limit?: number;
  /** Reserved for future relevance filtering. Accepted + unused in phase 1. */
  tags?: readonly string[];
};

/**
 * Return the media rows buildRichContext should inject into a system
 * prompt. Never inlined into buildRichContext directly so swapping
 * retrieval strategies (tag-match, embeddings) is a one-file change.
 */
/**
 * Fetch specific Media rows by ID — used by the two-pass Haiku selection
 * pipeline when selectContext returns mediaIds. Same sanitization as the
 * fallback selectMediaForContext below.
 */
export async function selectMediaByIds(
  ids: string[],
): Promise<MediaContextRow[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.media.findMany({
    where: { id: { in: ids }, status: "READY" },
    select: {
      url: true,
      tags: true,
      caption: true,
      originTitle: true,
      originAuthor: true,
      hallOfFame: true,
    },
  });

  return rows.map(toContextRow);
}

export async function selectMediaForContext(
  input: SelectMediaForContextInput,
): Promise<MediaContextRow[]> {
  const limit = input.limit ?? MAX_MEDIA_IN_CONTEXT;
  // input.characterId + input.tags are intentionally unread in phase 1;
  // they exist so tag-aware / character-aware retrieval can land later
  // without a call-site change.

  const rows = await prisma.media.findMany({
    where: { status: "READY" },
    orderBy: [
      { hallOfFame: "desc" },
      { createdAt: "desc" },
    ],
    take: limit,
    select: {
      url: true,
      tags: true,
      caption: true,
      originTitle: true,
      originAuthor: true,
      hallOfFame: true,
    },
  });

  return rows.map(toContextRow);
}

function toContextRow(row: {
  url: string;
  tags: string[];
  caption: string | null;
  originTitle: string | null;
  originAuthor: string | null;
  hallOfFame: boolean;
}): MediaContextRow {
  return {
    publicUrl: row.url,
    tags: sanitizeTags(row.tags),
    caption: sanitizeLLMText(row.caption, MAX_CAPTION_CHARS),
    originTitle: sanitizeLLMText(row.originTitle, MAX_ORIGIN_TEXT_CHARS),
    originAuthor: sanitizeLLMText(row.originAuthor, MAX_ORIGIN_TEXT_CHARS),
    hallOfFame: row.hallOfFame,
  };
}

/**
 * Sanitize a string before it reaches an LLM prompt. Strips:
 *   - markdown headers (so the text can't inject its own sections)
 *   - <suggest-agent ...> sentinels (our handoff-CTA marker)
 *   - control characters
 *   - repeated whitespace
 * Caps the result at `maxChars` and returns null for empty / null input.
 *
 * Exported so any path that funnels scraped / attacker-influenced text
 * into a prompt or tool_result can reuse the same primitive. Callers:
 *   - media-context.ts (caption, originTitle, originAuthor)
 *   - gallery_search agent tool (todo #10)
 */
export function sanitizeLLMText(
  raw: string | null | undefined,
  maxChars: number,
): string | null {
  if (!raw) return null;
  const cleaned = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join(" ")
    .replaceAll(/<\s*suggest-agent\b[^>]*>/gi, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, maxChars);
}

export function sanitizeTags(tags: readonly string[]): readonly string[] {
  return tags
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 0 &&
        !t.startsWith("#") &&
        !t.startsWith("<") &&
        // eslint-disable-next-line no-control-regex
        !/[\x00-\x1F\x7F]/.test(t),
    )
    .slice(0, MAX_TAGS_PER_ITEM);
}

export { MAX_MEDIA_IN_CONTEXT, MAX_CAPTION_CHARS, MAX_ORIGIN_TEXT_CHARS };
