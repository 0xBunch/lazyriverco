import "server-only";
import { prisma } from "@/lib/prisma";
import { runVisionTagging } from "@/lib/ai-tagging-run";
import { upsertTagRegistry } from "@/lib/tag-registry";
import type { IngestResult } from "@/lib/ingest";
import type { IngestSource } from "@/lib/feed-types";

// Persist an IngestResult as a Media row and dispatch vision tagging.
//
// Extracted from ingestAndSaveUrlAction so (a) the file doing the
// persistence isn't also a "use server" module (every export there
// becomes an RPC endpoint — we don't want this callable from the
// client), and (b) the feed poller (PR A1) reuses the same pipeline
// without the auth + rate-limit wrapper the user-facing action needs.
//
// Division of labor:
//   - ingestAndSaveUrlAction (action wrapper): auth, rate-limit,
//     input validation, caption/tag parsing, revalidatePath.
//   - persistIngest (this module): DB write, tag registry upsert,
//     vision-tag fire-and-forget. Derives hiddenFromGrid and
//     skipRateLimit from the IngestSource discriminator — callers
//     never thread those flags.

export type PersistIngestOptions = {
  caption?: string | null;
  tags?: string[];
};

export async function persistIngest(
  result: IngestResult,
  source: IngestSource,
  opts: PersistIngestOptions = {},
): Promise<{ id: string }> {
  const caption = opts.caption ?? null;
  const tags = opts.tags ?? [];
  const isFeed = source.kind === "feed";
  const feedId = source.kind === "feed" ? source.feedId : null;

  const created = await prisma.media.create({
    data: {
      uploadedById: source.uploadedById,
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
      // Feed-sourced items stay out of the main /library grid by
      // default; the "include auto-feed items" toggle on /library is
      // what surfaces them. User-pasted items show immediately.
      hiddenFromGrid: isFeed,
      feedId,
    },
    select: { id: true },
  });

  // Register any human-entered tags in the Tag table so /admin/memory/taxonomy
  // sees every slug that actually lives on a Media row. AI-produced
  // tags are upserted inside runVisionTagging. Feed-sourced ingest
  // passes no tags, making this a no-op.
  if (tags.length > 0) {
    await upsertTagRegistry(tags);
  }

  // Fire-and-forget vision tagging: Railway runs a persistent Node
  // process, so the orphan promise continues after the action returns.
  // Link-only items (no preview image) are skipped at the gate.
  if (result.mediaType !== "link" && result.url) {
    void runVisionTagging(source.uploadedById, created.id, {
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
