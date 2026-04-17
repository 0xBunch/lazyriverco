import "server-only";
import { prisma } from "@/lib/prisma";
import {
  sanitizeLLMText,
  sanitizeTags,
  MAX_CAPTION_CHARS,
  MAX_ORIGIN_TEXT_CHARS,
  MAX_MEDIA_IN_CONTEXT,
} from "@/lib/sanitize";

// Retrieval seam for the shared media bank section buildRichContext
// injects into agent system prompts.
//
// Phase 1 strategy: hall-of-fame first, then most-recent READY uploads,
// capped at MAX_MEDIA_IN_CONTEXT rows. The `tags` parameter is accepted
// but ignored so future retrieval strategies (tag matching, embeddings)
// can land without changing the call-site signature.
//
// Sanitation (security-sentinel M3, prompt injection): see src/lib/sanitize.ts
// — the primitives are extracted so the prompt-injection eval can verify
// them without pulling a server-only import chain. All caption / tag /
// originTitle / originAuthor fields pass through sanitizeLLMText before
// reaching the LLM. Only READY rows ever surface (PENDING in-flight +
// DELETED soft-hidden are filtered at the DB layer).

// Re-export so existing call sites keep working.
export {
  sanitizeLLMText,
  sanitizeTags,
  MAX_MEDIA_IN_CONTEXT,
  MAX_CAPTION_CHARS,
  MAX_ORIGIN_TEXT_CHARS,
};

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

// sanitize primitives + constants live in src/lib/sanitize.ts and are
// re-exported at the top of this file for backward compat.
