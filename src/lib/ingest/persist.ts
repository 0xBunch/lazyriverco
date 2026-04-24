import "server-only";
import { prisma } from "@/lib/prisma";
import { runVisionTagging } from "@/lib/ai-tagging-run";
import { upsertTagRegistry } from "@/lib/tag-registry";
import type { IngestResult } from "@/lib/ingest";

// Persist an IngestResult as a Media row and dispatch vision tagging.
//
// Extracted from ingestAndSaveUrlAction so (a) the file doing the
// persistence isn't also a "use server" module (every export there
// becomes an RPC endpoint — we don't want this callable from the
// client), and (b) a future cron feed poller can reuse the same
// pipeline without the auth + rate-limit wrapper the user-facing
// action needs.
//
// Division of labor:
//   - ingestAndSaveUrlAction (action wrapper): auth, rate-limit,
//     input validation, caption/tag parsing, revalidatePath.
//   - persistIngest (this module): DB write, tag registry upsert,
//     vision-tag fire-and-forget.
//
// PR A0 signature: `uploadedById: string`. PR A1 evolves this to a
// discriminated IngestSource union (user vs feed) so feed-sourced
// ingest can set feedId + hiddenFromGrid + skipRateLimit distinctly.
// Until then, all callers are user-sourced and behavior matches the
// pre-refactor action exactly.

export type PersistIngestOptions = {
  caption?: string | null;
  tags?: string[];
};

export async function persistIngest(
  result: IngestResult,
  uploadedById: string,
  opts: PersistIngestOptions = {},
): Promise<{ id: string }> {
  const caption = opts.caption ?? null;
  const tags = opts.tags ?? [];

  const created = await prisma.media.create({
    data: {
      uploadedById,
      url: result.url,
      sourceUrl: result.sourceUrl,
      type: result.mediaType,
      origin: result.origin,
      originTitle: result.originTitle,
      originAuthor: result.originAuthor,
      ogImageUrl: result.ogImageUrl,
      embedHtml: result.embedHtml,
      storedLocally: result.storedLocally,
      mimeType: result.mimeType,
      caption,
      tags,
      status: "READY",
    },
    select: { id: true },
  });

  // Register any human-entered tags in the Tag table so /admin/taxonomy
  // sees every slug that actually lives on a Media row. AI-produced
  // tags are upserted inside runVisionTagging. Feed-sourced ingest
  // (once wired in PR A1) will pass no tags, making this a no-op.
  if (tags.length > 0) {
    await upsertTagRegistry(tags);
  }

  // Fire-and-forget vision tagging: Railway runs a persistent Node
  // process, so the orphan promise continues after the action returns.
  // Link-only items (no preview image) are skipped at the gate.
  if (result.mediaType !== "link" && result.url) {
    void runVisionTagging(uploadedById, created.id, {
      imageUrl: result.url,
      caption,
      originTitle: result.originTitle,
      originAuthor: result.originAuthor,
    }).catch((e) =>
      console.error("vision-tag bg failed (persistIngest)", created.id, e),
    );
  }

  return { id: created.id };
}
