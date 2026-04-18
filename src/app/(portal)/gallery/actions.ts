"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";
import { ingestUrl, IngestError } from "@/lib/ingest";
import { analyzeMedia, type AnalyzeMediaInput } from "@/lib/ai-tagging";

// Gallery server actions. Invoked from the add modal + anywhere a member
// can edit their own item's metadata. All actions:
//   - require a signed-in user
//   - rate-limit the expensive ones (outbound ingest fetch)
//   - validate + normalize user-supplied strings
//   - revalidate /gallery so the grid reflects mutations on the next render
//
// Return shape is always { ok: true, ... } | { ok: false, error }. We
// don't throw from server actions because Next turns thrown errors into
// generic 500s; sending a discriminated result lets the client render an
// inline error instead.

const INGEST_LIMIT = { maxPerMinute: 10, maxPerDay: 200 };
const MAX_CAPTION_CHARS = 500;
const MAX_TAGS = 8;
const MAX_TAG_CHARS = 40;
const TAG_SHAPE = /^[a-z0-9][a-z0-9\-_]*$/;

export type SaveResult =
  | { ok: true; mediaId: string }
  | { ok: false; error: string };

export type MetaResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Paste-link flow — takes a URL, runs it through the ingest adapter,
// persists the resulting Media row with the user-supplied caption + tags.

export async function ingestAndSaveUrlAction(input: {
  url: string;
  caption: string;
  tags: string;
}): Promise<SaveResult> {
  const user = await requireUser();

  try {
    await assertWithinLimit(user.id, "gallery.ingest", INGEST_LIMIT);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return {
        ok: false,
        error: `Too many links this hour. Try again in ~${Math.ceil(e.retryAfterSeconds / 60)} min.`,
      };
    }
    throw e;
  }

  const url = (input.url ?? "").trim();
  if (!url) return { ok: false, error: "Paste a link first." };
  if (url.length > 2048) {
    return { ok: false, error: "That URL is suspiciously long." };
  }

  const caption = sanitizeCaption(input.caption);
  const tagResult = parseTags(input.tags);
  if (tagResult.kind === "error") return { ok: false, error: tagResult.message };
  const tags = tagResult.tags;

  let ingest;
  try {
    ingest = await ingestUrl(url);
  } catch (e) {
    if (e instanceof IngestError) return { ok: false, error: e.message };
    // Unknown failure — surface a generic message rather than a stack
    // trace. Logs will still capture the original error server-side.
    console.error("ingest failed", e);
    return { ok: false, error: "Couldn't fetch a preview for that link." };
  }

  const created = await prisma.media.create({
    data: {
      uploadedById: user.id,
      url: ingest.url,
      sourceUrl: ingest.sourceUrl,
      type: ingest.mediaType,
      origin: ingest.origin,
      originTitle: ingest.originTitle,
      originAuthor: ingest.originAuthor,
      ogImageUrl: ingest.ogImageUrl,
      embedHtml: ingest.embedHtml,
      storedLocally: ingest.storedLocally,
      mimeType: ingest.mimeType,
      caption,
      tags,
      status: "READY",
    },
    select: { id: true },
  });

  // Fire-and-forget: Railway runs a persistent Node process, so the
  // orphan promise continues after the action returns. The user's save
  // lands instantly; tags arrive seconds later on the next render.
  // Link-only items (no preview image) are skipped at the gate.
  if (ingest.mediaType !== "link" && ingest.url) {
    void runVisionTagging(user.id, created.id, {
      imageUrl: ingest.url,
      caption,
      originTitle: ingest.originTitle,
      originAuthor: ingest.originAuthor,
    }).catch((e) =>
      console.error("vision-tag bg failed (ingest)", created.id, e),
    );
  }

  revalidatePath("/gallery");
  return { ok: true, mediaId: created.id };
}

// ---------------------------------------------------------------------------
// Upload-finalize flow — the client has already run presign + direct R2
// upload + commit, which created a Media row with status=READY. This
// action fills in the caption + tags the user entered in the modal.

export async function updateMediaMetaAction(input: {
  mediaId: string;
  caption: string;
  tags: string;
}): Promise<MetaResult> {
  const user = await requireUser();

  const mediaId = (input.mediaId ?? "").trim();
  if (!mediaId) return { ok: false, error: "Missing media id." };

  const caption = sanitizeCaption(input.caption);
  const tagResult = parseTags(input.tags);
  if (tagResult.kind === "error") return { ok: false, error: tagResult.message };
  const tags = tagResult.tags;

  // Ownership gate: uploader can edit their own; admin can edit anything.
  const where =
    user.role === "ADMIN"
      ? { id: mediaId }
      : { id: mediaId, uploadedById: user.id };

  const result = await prisma.media.updateMany({
    where,
    data: { caption, tags },
  });

  if (result.count === 0) {
    return { ok: false, error: "Media not found or not yours." };
  }

  // Upload path: no OG scrape at creation time, so this is the first
  // moment we have the caption the user wants indexed alongside the
  // image. Tag once per row — re-edits don't retrigger. Fire-and-forget
  // per the ingest path; skip non-image mimeTypes (direct video uploads).
  const row = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      url: true,
      mimeType: true,
      originTitle: true,
      originAuthor: true,
      aiAnalyzedAt: true,
    },
  });
  const isImage = row?.mimeType?.startsWith("image/") ?? true;
  if (row && row.aiAnalyzedAt === null && row.url && isImage) {
    void runVisionTagging(user.id, mediaId, {
      imageUrl: row.url,
      caption,
      originTitle: row.originTitle,
      originAuthor: row.originAuthor,
    }).catch((e) =>
      console.error("vision-tag bg failed (meta)", mediaId, e),
    );
  }

  revalidatePath("/gallery");
  revalidatePath(`/gallery/${mediaId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vision tagging — inline after save. Soft-fails: anything that goes
// wrong here still leaves the Media row committed; aiAnalysisNote
// records the reason so an admin sweeper can retry later.

const AI_TAG_LIMIT = { maxPerMinute: 30, maxPerDay: 1000 };

async function runVisionTagging(
  userId: string,
  mediaId: string,
  input: AnalyzeMediaInput,
): Promise<void> {
  try {
    await assertWithinLimit(userId, "gallery.ai-tag", AI_TAG_LIMIT);
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
  // functional index picks them up and the agent `gallery_search` tool
  // can find named entities. `aiTags` stays in its own column as the
  // audit trail — admin tooling can diff them out to "un-AI-tag" a row.
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
}

// ---------------------------------------------------------------------------
// Input normalization

function sanitizeCaption(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CAPTION_CHARS);
}

type ParseTagsResult =
  | { kind: "ok"; tags: string[] }
  | { kind: "error"; message: string };

function parseTags(raw: string): ParseTagsResult {
  if (!raw || typeof raw !== "string") return { kind: "ok", tags: [] };
  const parts = raw
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length > MAX_TAGS) {
    return { kind: "error", message: `Max ${MAX_TAGS} tags per item.` };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (p.length > MAX_TAG_CHARS) {
      return {
        kind: "error",
        message: `Tag "${p.slice(0, 20)}…" too long — keep under ${MAX_TAG_CHARS} chars.`,
      };
    }
    if (!TAG_SHAPE.test(p)) {
      return {
        kind: "error",
        message: `Tag "${p}" — use a-z, 0-9, dash or underscore only.`,
      };
    }
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return { kind: "ok", tags: out };
}
