"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Commissioner-side bulk operations for the gallery. Each action is
// useFormState-compatible: signature is (prevState, formData) => State
// so client forms can bind via `useFormState(action, null)` and surface
// validation / error messages inline instead of through Next's
// anonymized digest error boundary. Same pattern we retrofit into
// admin/agents alongside this PR — see those actions for the full
// rationale, short version: throws become digests in prod, returns
// become real messages.

export type AdminGalleryState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

const MAX_IDS_PER_ACTION = 200;
const TAG_SHAPE = /^[a-z0-9][a-z0-9\-_]*$/;
const MAX_TAG_CHARS = 40;

function parseIds(fd: FormData): string[] {
  return fd
    .getAll("mediaIds")
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, MAX_IDS_PER_ACTION);
}

function parseTag(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t || t.length > MAX_TAG_CHARS || !TAG_SHAPE.test(t)) return null;
  return t;
}

function revalidateGallerySurfaces() {
  revalidatePath("/admin/gallery");
  revalidatePath("/gallery");
}

// --- bulk delete ----------------------------------------------------------

export async function bulkDeleteAction(
  _prev: AdminGalleryState,
  fd: FormData,
): Promise<AdminGalleryState> {
  try {
    await requireAdmin();
    const ids = parseIds(fd);
    if (ids.length === 0) return { ok: false, error: "No items selected." };

    const result = await prisma.media.updateMany({
      where: { id: { in: ids } },
      data: { status: "DELETED" },
    });
    revalidateGallerySurfaces();
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
  _prev: AdminGalleryState,
  fd: FormData,
): Promise<AdminGalleryState> {
  try {
    await requireAdmin();
    const ids = parseIds(fd);
    if (ids.length === 0) return { ok: false, error: "No items selected." };
    const hide = fd.get("hide") === "true";

    const result = await prisma.media.updateMany({
      where: { id: { in: ids } },
      data: { hiddenFromGrid: hide },
    });
    revalidateGallerySurfaces();
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
  _prev: AdminGalleryState,
  fd: FormData,
): Promise<AdminGalleryState> {
  try {
    await requireAdmin();
    const ids = parseIds(fd);
    if (ids.length === 0) return { ok: false, error: "No items selected." };
    const star = fd.get("star") === "true";

    const result = await prisma.media.updateMany({
      where: { id: { in: ids } },
      data: { hallOfFame: star },
    });
    revalidateGallerySurfaces();
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
  _prev: AdminGalleryState,
  fd: FormData,
): Promise<AdminGalleryState> {
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

    revalidateGallerySurfaces();
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
