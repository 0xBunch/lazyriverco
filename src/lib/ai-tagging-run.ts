import "server-only";
import { prisma } from "@/lib/prisma";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import { analyzeMedia, type AnalyzeMediaInput } from "@/lib/ai-tagging";
import { upsertTagRegistry } from "@/lib/tag-registry";

// Shared vision-tagging runner. Extracted from library/actions.ts so admin
// reanalyze actions + the backfill script can reuse the same persist-and-
// rate-limit flow without living in a "use server" file (every export in
// a server-action module becomes an RPC endpoint — we don't want this
// callable from the client).
//
// Contract: on success, merges AI tags into `tags`, writes `aiTags`, sets
// `aiAnalyzedAt`, clears `aiAnalysisNote`. On soft-failure, sets
// `aiAnalyzedAt` + `aiAnalysisNote` and leaves `tags`/`aiTags` untouched.
// Never throws — caller can ignore the returned promise.

const AI_TAG_LIMIT = { maxPerMinute: 30, maxPerDay: 1000 };

export type RunVisionTaggingOptions = {
  /** Skip the per-user rate-limit check. Set by the backfill script — it
   *  already serializes work, it's admin-initiated, and the userId may be
   *  synthetic (no matching User row, which would trip the RateLimitHit FK). */
  skipRateLimit?: boolean;
};

export async function runVisionTagging(
  userId: string,
  mediaId: string,
  input: AnalyzeMediaInput,
  opts: RunVisionTaggingOptions = {},
): Promise<void> {
  if (!opts.skipRateLimit) {
    try {
      await assertWithinLimit(userId, "library.ai-tag", AI_TAG_LIMIT);
    } catch (e) {
      if (e instanceof RateLimitError) {
        await prisma.media
          .update({
            where: { id: mediaId },
            data: {
              aiAnalyzedAt: new Date(),
              aiAnalysisNote: "skipped: rate-limited",
            },
          })
          .catch((err) =>
            console.error("vision-tag persist failed (rate-limit)", mediaId, err),
          );
        return;
      }
      throw e;
    }
  }

  const result = await analyzeMedia(input);

  if (!result.ok) {
    await prisma.media
      .update({
        where: { id: mediaId },
        data: {
          aiAnalyzedAt: result.analyzedAt,
          aiAnalysisNote: result.note,
        },
      })
      .catch((err) =>
        console.error("vision-tag persist failed (fail-note)", mediaId, err),
      );
    return;
  }

  // Merge AI tags into the primary `tags` array so the existing FTS
  // functional index picks them up and the agent `library_search` tool can
  // find named entities. `aiTags` stays in its own column as the audit
  // trail — admin tooling can diff them out to "un-AI-tag" a row.
  const existing = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { tags: true },
  });
  if (!existing) return;
  const merged = Array.from(new Set([...existing.tags, ...result.tags]));

  await prisma.media
    .update({
      where: { id: mediaId },
      data: {
        tags: merged,
        aiTags: result.tags,
        aiAnalyzedAt: result.analyzedAt,
        aiAnalysisNote: null,
      },
    })
    .catch((err) =>
      console.error("vision-tag persist failed (success)", mediaId, err),
    );

  // Register new slugs in the Tag table so they show up on the admin
  // taxonomy page. Only the AI-produced tags need upserting here — any
  // human-entered tags that landed in `existing.tags` already went
  // through the ingest / upload-meta paths which upsert themselves.
  await upsertTagRegistry(result.tags);
}
