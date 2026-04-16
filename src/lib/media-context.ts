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
// Sanitation (security-sentinel M3, prompt injection): any caption or
// tag that originated from an admin-uploaded row gets stripped of
// markdown headers, <suggest-agent> sentinels, and control characters
// before it hits the system prompt. The Media table has a Prisma-enum
// `status` column so only READY rows ever reach the LLM — PENDING
// (presign in flight) and DELETED (soft-removed) are filtered out.

const MAX_MEDIA_IN_CONTEXT = 10;
const MAX_CAPTION_CHARS = 200;
const MAX_TAGS_PER_ITEM = 20;

export type MediaContextRow = {
  publicUrl: string;
  tags: readonly string[];
  caption: string | null;
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
      hallOfFame: true,
    },
  });

  return rows.map((row) => ({
    publicUrl: row.url,
    tags: sanitizeTags(row.tags),
    caption: sanitizeCaption(row.caption),
    hallOfFame: row.hallOfFame,
  }));
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
      hallOfFame: true,
    },
  });

  return rows.map((row) => ({
    publicUrl: row.url,
    tags: sanitizeTags(row.tags),
    caption: sanitizeCaption(row.caption),
    hallOfFame: row.hallOfFame,
  }));
}

function sanitizeCaption(caption: string | null): string | null {
  if (!caption) return null;
  const cleaned = caption
    .split("\n")
    // Strip markdown headers — don't let admin-uploaded captions inject
    // their own sections into the system prompt.
    .filter((line) => !line.trimStart().startsWith("#"))
    .join(" ")
    // Strip suggest-agent sentinels so a caption can't trigger a
    // spurious handoff CTA when rendered back to a user.
    .replaceAll(/<\s*suggest-agent\b[^>]*>/gi, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, MAX_CAPTION_CHARS);
}

function sanitizeTags(tags: readonly string[]): readonly string[] {
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

export { MAX_MEDIA_IN_CONTEXT, MAX_CAPTION_CHARS };
