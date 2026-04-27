"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { runVisionTagging } from "@/lib/ai-tagging-run";
import { getBannedSlugs } from "@/lib/ai-taxonomy";
import { parseTag } from "@/lib/tag-shape";
import { upsertTagRegistry } from "@/lib/tag-registry";

// Commissioner-side bulk operations for the library. Each action is
// useFormState-compatible: signature is (prevState, formData) => State
// so client forms can bind via `useFormState(action, null)` and surface
// validation / error messages inline instead of through Next's
// anonymized digest error boundary. Same pattern we retrofit into
// admin/ai/personas alongside this PR — see those actions for the full
// rationale, short version: throws become digests in prod, returns
// become real messages.

export type AdminLibraryState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

const MAX_IDS_PER_ACTION = 200;

function parseIds(fd: FormData): string[] {
  // Dedupe before the cap so 30 copies of one id don't eat the whole slot
  // budget + fan out into N parallel background jobs against the same row.
  const unique = new Set(
    fd
      .getAll("mediaIds")
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );
  return Array.from(unique).slice(0, MAX_IDS_PER_ACTION);
}

function revalidateLibrarySurfaces() {
  revalidatePath("/admin/memory/library");
  revalidatePath("/library");
}

// --- bulk delete ----------------------------------------------------------

export async function bulkDeleteAction(
  _prev: AdminLibraryState,
  fd: FormData,
): Promise<AdminLibraryState> {
  try {
    await requireAdmin();
    const ids = parseIds(fd);
    if (ids.length === 0) return { ok: false, error: "No items selected." };

    const result = await prisma.media.updateMany({
      where: { id: { in: ids } },
      data: { status: "DELETED" },
    });
    revalidateLibrarySurfaces();
    return {
      ok: true,
      message: `Deleted ${result.count} item${result.count === 1 ? "" : "s"} (soft-delete; restore by flipping status in DB).`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Delete failed.",
    };
  }
}

// --- bulk hide / unhide ---------------------------------------------------

export async function bulkHideAction(
  _prev: AdminLibraryState,
  fd: FormData,
): Promise<AdminLibraryState> {
  try {
    await requireAdmin();
    const ids = parseIds(fd);
    if (ids.length === 0) return { ok: false, error: "No items selected." };
    const hide = fd.get("hide") === "true";

    const result = await prisma.media.updateMany({
      where: { id: { in: ids } },
      data: { hiddenFromGrid: hide },
    });
    revalidateLibrarySurfaces();
    return {
      ok: true,
      message: `${hide ? "Hid" : "Unhid"} ${result.count} item${result.count === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Hide toggle failed.",
    };
  }
}

// --- bulk hall of fame ----------------------------------------------------

export async function bulkHoFAction(
  _prev: AdminLibraryState,
  fd: FormData,
): Promise<AdminLibraryState> {
  try {
    await requireAdmin();
    const ids = parseIds(fd);
    if (ids.length === 0) return { ok: false, error: "No items selected." };
    const star = fd.get("star") === "true";

    const result = await prisma.media.updateMany({
      where: { id: { in: ids } },
      data: { hallOfFame: star },
    });
    revalidateLibrarySurfaces();
    return {
      ok: true,
      message: `${star ? "Starred" : "Unstarred"} ${result.count} item${result.count === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Hall of Fame toggle failed.",
    };
  }
}

// --- bulk tag add / remove ------------------------------------------------
// Prisma has no "append-unique" operator on string[] for updateMany, so we
// read-modify-write per row inside a transaction. Linear in row count but
// the table caps at MAX_IDS_PER_ACTION so worst case is 200 updates.

export async function bulkTagAction(
  _prev: AdminLibraryState,
  fd: FormData,
): Promise<AdminLibraryState> {
  try {
    await requireAdmin();
    const ids = parseIds(fd);
    if (ids.length === 0) return { ok: false, error: "No items selected." };
    const tag = parseTag(fd.get("tag"));
    if (!tag) {
      return {
        ok: false,
        error: "Tag required — lowercase a-z, 0-9, dash/underscore, up to 40 chars.",
      };
    }
    const mode = fd.get("mode") === "remove" ? "remove" : "add";

    // Refuse to re-add a currently-banned slug. The ban flow already
    // stripped this slug from every Media row; letting bulk-add undo
    // that silently would break the "banned ⇒ absent from Media" invariant
    // and leave the admin wondering why their ban didn't stick. Remove
    // mode is still allowed — ad-hoc cleanup of banned tags that were
    // added to rows before the ban.
    if (mode === "add") {
      const banned = await getBannedSlugs();
      if (banned.has(tag)) {
        return {
          ok: false,
          error: `"${tag}" is banned. Unban it on /admin/memory/taxonomy first if you want to use it.`,
        };
      }
    }

    const rows = await prisma.media.findMany({
      where: { id: { in: ids } },
      select: { id: true, tags: true },
    });

    await prisma.$transaction(
      rows.map((r) => {
        const current = new Set(r.tags);
        if (mode === "add") current.add(tag);
        else current.delete(tag);
        return prisma.media.update({
          where: { id: r.id },
          data: { tags: Array.from(current) },
        });
      }),
    );

    // Register the slug in the Tag table so the admin page sees it.
    // Remove mode deliberately doesn't clean up the Tag row — the slug
    // may still be on Media rows that weren't selected, and dropping
    // the registry entry preemptively would hide those tags from the
    // admin page. Tag rows only disappear via an explicit delete in
    // the taxonomy admin.
    if (mode === "add") await upsertTagRegistry([tag]);

    revalidateLibrarySurfaces();
    return {
      ok: true,
      message: `${mode === "add" ? "Added" : "Removed"} tag "${tag}" ${mode === "add" ? "to" : "from"} ${rows.length} item${rows.length === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Tag update failed.",
    };
  }
}

// --- bulk reanalyze (AI vision) -------------------------------------------
// Reruns Gemini tagging on selected rows. Capped tight because the runner
// respects a 30/min rate-limit bucket per user — queuing 200 would just
// soft-fail 170 of them as "skipped: rate-limited". For full repopulation
// or large sweeps, run `pnpm backfill:ai-tags` instead.

const MAX_REANALYZE_PER_ACTION = 30;
const REANALYZE_CONCURRENCY = 3;

export async function bulkReanalyzeAction(
  _prev: AdminLibraryState,
  fd: FormData,
): Promise<AdminLibraryState> {
  try {
    const admin = await requireAdmin();
    const ids = parseIds(fd);
    if (ids.length === 0) return { ok: false, error: "No items selected." };
    if (ids.length > MAX_REANALYZE_PER_ACTION) {
      return {
        ok: false,
        error: `Re-analyze is capped at ${MAX_REANALYZE_PER_ACTION} per click (rate-limit). Run the backfill script for larger batches.`,
      };
    }

    const rows = await prisma.media.findMany({
      where: {
        id: { in: ids },
        type: { not: "link" },
        status: { not: "DELETED" },
      },
      select: {
        id: true,
        url: true,
        mimeType: true,
        caption: true,
        originTitle: true,
        originAuthor: true,
      },
    });

    // Strict eligibility: must have a url AND a known image/* mimeType.
    // Unknown-mimeType rows (embed-origin Twitter/IG where we never
    // scraped a content-type) don't fetch as images anyway — Gemini
    // soft-fails them but the call still burns a rate-limit slot. Gate
    // them out here so the admin isn't billed for guaranteed-fail work.
    const eligible = rows.filter(
      (r) => r.url && (r.mimeType?.startsWith("image/") ?? false),
    );
    if (eligible.length === 0) {
      return {
        ok: false,
        error: "None of the selected items have a fetchable image (links + videos + embed-only rows skipped).",
      };
    }

    // Concurrency-capped background pool. Prior shape was `for … void
    // runVisionTagging(…)` which fans out all 30 Gemini calls in parallel
    // — bad for event-loop + per-IP outbound limits on Railway. The pool
    // runs unawaited (caller returns immediately) but internally only
    // REANALYZE_CONCURRENCY outbound calls are live at a time.
    void runReanalyzePool(
      admin.id,
      eligible.map((r) => ({
        id: r.id,
        imageUrl: r.url,
        caption: r.caption,
        originTitle: r.originTitle,
        originAuthor: r.originAuthor,
      })),
    ).catch((err) => console.error("reanalyze pool failed", err));

    revalidateLibrarySurfaces();
    return {
      ok: true,
      message: `Re-analyzing ${eligible.length} item${eligible.length === 1 ? "" : "s"} in the background. Refresh in ~30s to see updated tags.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Re-analyze failed.",
    };
  }
}

type PoolItem = {
  id: string;
  imageUrl: string;
  caption: string | null;
  originTitle: string | null;
  originAuthor: string | null;
};

async function runReanalyzePool(
  adminId: string,
  items: PoolItem[],
): Promise<void> {
  const queue = [...items];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      try {
        await runVisionTagging(adminId, item.id, {
          imageUrl: item.imageUrl,
          caption: item.caption,
          originTitle: item.originTitle,
          originAuthor: item.originAuthor,
        });
      } catch (err) {
        console.error("reanalyze worker failed", item.id, err);
      }
    }
  }
  await Promise.all(
    Array.from({ length: REANALYZE_CONCURRENCY }, () => worker()),
  );
}

// --- single reanalyze (detail page) ---------------------------------------

export async function reanalyzeOneAction(
  _prev: AdminLibraryState,
  fd: FormData,
): Promise<AdminLibraryState> {
  try {
    const admin = await requireAdmin();
    const mediaId = fd.get("mediaId");
    if (typeof mediaId !== "string" || !mediaId) {
      return { ok: false, error: "Missing media id." };
    }

    const row = await prisma.media.findFirst({
      where: { id: mediaId, status: { not: "DELETED" } },
      select: {
        id: true,
        url: true,
        type: true,
        mimeType: true,
        caption: true,
        originTitle: true,
        originAuthor: true,
      },
    });
    if (!row) return { ok: false, error: "Media not found (or soft-deleted)." };
    if (row.type === "link") {
      return { ok: false, error: "Link-only items have no preview image to analyze." };
    }
    if (!row.url) return { ok: false, error: "Media row is missing url." };
    const isImage = row.mimeType?.startsWith("image/") ?? false;
    if (!isImage) {
      return {
        ok: false,
        error: "No image mime-type on this row — nothing to analyze (direct videos + embed-only items skipped).",
      };
    }

    void runVisionTagging(admin.id, row.id, {
      imageUrl: row.url,
      caption: row.caption,
      originTitle: row.originTitle,
      originAuthor: row.originAuthor,
    }).catch((err) =>
      console.error("reanalyze one bg failed", row.id, err),
    );

    revalidateLibrarySurfaces();
    revalidatePath(`/library/${mediaId}`);
    return {
      ok: true,
      message: "Re-analyzing in the background. Refresh in ~15s.",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Re-analyze failed.",
    };
  }
}
