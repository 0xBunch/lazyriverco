"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

// Normalizes a user-pasted video URL down to a trimmed string or null.
// Actual validation happens at render time (parseVideoEmbed) — we don't
// reject unrecognized hosts on write, only refuse to render them.
function normalizeVideoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

function normalizeLongText(raw: unknown, cap: number): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, cap);
}

export async function createCalendarEntry(formData: FormData): Promise<void> {
  await requireAdmin();

  const title = formData.get("title");
  const date = formData.get("date");
  const recurrence = formData.get("recurrence");
  const tagsRaw = formData.get("tags");
  const description = formData.get("description");
  const time = formData.get("time");

  if (typeof title !== "string" || !title.trim()) throw new Error("Title is required");
  if (typeof date !== "string" || !date) throw new Error("Date is required");

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) throw new Error("Invalid date");

  await prisma.calendarEntry.create({
    data: {
      title: title.trim(),
      date: parsedDate,
      recurrence: recurrence === "annual" ? "annual" : "none",
      tags: parseTags(typeof tagsRaw === "string" ? tagsRaw : ""),
      description: normalizeLongText(description, 500),
      // Free-form string ("7:00 PM" / "Noon") — see schema comment on the
      // `time` field for why this isn't @db.Time.
      time: normalizeLongText(time, 40),
    },
  });

  revalidatePath("/admin/calendar");
  revalidatePath("/calendar");
}

export async function updateCalendarEntry(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  const title = formData.get("title");
  const date = formData.get("date");
  const recurrence = formData.get("recurrence");
  const tagsRaw = formData.get("tags");
  const description = formData.get("description");
  const body = formData.get("body");
  const videoEmbedUrl = formData.get("videoEmbedUrl");
  const time = formData.get("time");

  if (typeof id !== "string" || !id) throw new Error("Missing id");
  if (typeof title !== "string" || !title.trim()) throw new Error("Title is required");
  if (typeof date !== "string" || !date) throw new Error("Date is required");

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) throw new Error("Invalid date");

  // Quick-edit form omits `time`; don't clobber an existing value when
  // the field isn't in the payload. Any form that renders `name="time"`
  // at all must render it unconditionally or its absence becomes a silent
  // delete.
  const timeUpdate = formData.has("time")
    ? { time: normalizeLongText(time, 40) }
    : {};

  await prisma.calendarEntry.update({
    where: { id },
    data: {
      title: title.trim(),
      date: parsedDate,
      recurrence: recurrence === "annual" ? "annual" : "none",
      tags: parseTags(typeof tagsRaw === "string" ? tagsRaw : ""),
      description: normalizeLongText(description, 500),
      body: normalizeLongText(body, 10_000),
      videoEmbedUrl: normalizeVideoUrl(videoEmbedUrl),
      ...timeUpdate,
    },
  });

  revalidatePath("/admin/calendar");
  revalidatePath(`/admin/calendar/${id}`);
  revalidatePath("/calendar");
  revalidatePath(`/calendar/${id}`);
}

export async function deleteCalendarEntry(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing id");

  // Cascade on CalendarEntryMedia removes the join rows; the Media rows
  // themselves survive (shared bank — other entries or consumers may still
  // reference them).
  await prisma.calendarEntry.delete({ where: { id } });

  revalidatePath("/admin/calendar");
  revalidatePath("/calendar");
}

// ---------- Bulk actions (useFormState-compatible) -----------------------
//
// Bulk ops follow the same `(prevState, formData) => State` shape as the
// library admin so the client can bind via useFormState and surface
// messages inline (throws become digests in prod, returns become real
// strings). Selected ids are passed as N `entryId` hidden inputs sharing
// a `form="..."` association — see AdminLibraryTable for the precedent.

export type AdminCalendarState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

const MAX_IDS_PER_ACTION = 200;
const TAG_SHAPE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function parseBulkIds(fd: FormData): string[] {
  // Dedupe before the cap; a duplicate id list would otherwise bloat the
  // transaction and — on tag add/remove — do redundant read-modify-writes.
  const unique = new Set(
    fd
      .getAll("entryId")
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );
  return Array.from(unique).slice(0, MAX_IDS_PER_ACTION);
}

function revalidateCalendarSurfaces() {
  revalidatePath("/admin/calendar");
  revalidatePath("/calendar");
}

export async function bulkDeleteCalendarEntriesAction(
  _prev: AdminCalendarState,
  fd: FormData,
): Promise<AdminCalendarState> {
  try {
    await requireAdmin();
    const ids = parseBulkIds(fd);
    if (ids.length === 0) return { ok: false, error: "No dates selected." };

    const result = await prisma.calendarEntry.deleteMany({
      where: { id: { in: ids } },
    });
    revalidateCalendarSurfaces();
    return {
      ok: true,
      message: `Deleted ${result.count} date${result.count === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Bulk delete failed.",
    };
  }
}

export async function bulkTagCalendarEntriesAction(
  _prev: AdminCalendarState,
  fd: FormData,
): Promise<AdminCalendarState> {
  try {
    await requireAdmin();
    const ids = parseBulkIds(fd);
    if (ids.length === 0) return { ok: false, error: "No dates selected." };

    const rawTag = fd.get("tag");
    const tag =
      typeof rawTag === "string" ? rawTag.trim().toLowerCase() : "";
    if (!tag || !TAG_SHAPE.test(tag)) {
      return {
        ok: false,
        error:
          "Tag required — lowercase a–z, 0–9, dash/underscore, up to 40 chars, must start with a letter or digit.",
      };
    }
    const mode = fd.get("mode") === "remove" ? "remove" : "add";

    // No registry/ban discipline for calendar tags (unlike library tags —
    // those feed an AI taxonomy). Calendar tags are free-form strings that
    // the admin writes to match their own mental model.
    const rows = await prisma.calendarEntry.findMany({
      where: { id: { in: ids } },
      select: { id: true, tags: true },
    });

    await prisma.$transaction(
      rows.map((r) => {
        const current = new Set(r.tags);
        if (mode === "add") current.add(tag);
        else current.delete(tag);
        return prisma.calendarEntry.update({
          where: { id: r.id },
          data: { tags: Array.from(current) },
        });
      }),
    );

    revalidateCalendarSurfaces();
    return {
      ok: true,
      message: `${mode === "add" ? "Added" : "Removed"} tag "${tag}" ${mode === "add" ? "to" : "from"} ${rows.length} date${rows.length === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Bulk tag failed.",
    };
  }
}

// ---------- Media attachment actions ----------
//
// These are invoked from the /admin/calendar/[id] page's media manager.
// Each re-validates both the admin detail page and the public detail
// page so edits feel immediate.

export async function attachMediaToCalendarEntry(input: {
  calendarEntryId: string;
  mediaId: string;
}): Promise<void> {
  await requireAdmin();
  const { calendarEntryId, mediaId } = input;
  if (!calendarEntryId || !mediaId) throw new Error("Missing id");

  // RACE NOTE: dropping 10 photos at once fires 10 parallel server-action
  // calls. Without serialization, every racer reads count=0 and inserts
  // position=0 *and* isCover=true — duplicate covers + colliding positions.
  // Fix: Postgres advisory lock keyed on the calendarEntryId hash scopes
  // the serialization to THIS entry only (not the whole table) and auto-
  // releases when the transaction commits. count() is then read inside the
  // lock's scope so it reflects all prior committed attaches.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${calendarEntryId}))`;

    const count = await tx.calendarEntryMedia.count({
      where: { calendarEntryId },
    });

    try {
      await tx.calendarEntryMedia.create({
        data: {
          calendarEntryId,
          mediaId,
          position: count,
          isCover: count === 0, // first attachment auto-becomes cover
        },
      });
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "P2002"
      ) {
        // Already attached (unique on (calendarEntryId, mediaId)) — no-op.
      } else {
        throw e;
      }
    }
  });

  revalidatePath(`/admin/calendar/${calendarEntryId}`);
  revalidatePath(`/calendar/${calendarEntryId}`);
}

export async function detachMediaFromCalendarEntry(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const attachId = formData.get("attachId");
  const calendarEntryId = formData.get("calendarEntryId");
  if (typeof attachId !== "string" || !attachId) throw new Error("Missing attachId");
  if (typeof calendarEntryId !== "string" || !calendarEntryId)
    throw new Error("Missing calendarEntryId");

  // Delete the join row only. Media row stays in the shared bank —
  // "remove from this entry" isn't the same as "delete the photo."
  await prisma.calendarEntryMedia.delete({ where: { id: attachId } });

  // If we just removed the cover, promote the first remaining attachment.
  const remaining = await prisma.calendarEntryMedia.findMany({
    where: { calendarEntryId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: 1,
  });
  if (remaining.length === 1) {
    const stillHasCover = await prisma.calendarEntryMedia.count({
      where: { calendarEntryId, isCover: true },
    });
    if (stillHasCover === 0) {
      await prisma.calendarEntryMedia.update({
        where: { id: remaining[0]!.id },
        data: { isCover: true },
      });
    }
  }

  revalidatePath(`/admin/calendar/${calendarEntryId}`);
  revalidatePath(`/calendar/${calendarEntryId}`);
}

export async function setCalendarEntryCoverMedia(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const attachId = formData.get("attachId");
  const calendarEntryId = formData.get("calendarEntryId");
  if (typeof attachId !== "string" || !attachId) throw new Error("Missing attachId");
  if (typeof calendarEntryId !== "string" || !calendarEntryId)
    throw new Error("Missing calendarEntryId");

  // Two writes in a transaction: clear any existing cover, then set the
  // new one. Keeps the "at most one cover" invariant app-enforced.
  await prisma.$transaction([
    prisma.calendarEntryMedia.updateMany({
      where: { calendarEntryId, isCover: true },
      data: { isCover: false },
    }),
    prisma.calendarEntryMedia.update({
      where: { id: attachId },
      data: { isCover: true },
    }),
  ]);

  revalidatePath(`/admin/calendar/${calendarEntryId}`);
  revalidatePath(`/calendar/${calendarEntryId}`);
}

export async function reorderCalendarEntryMedia(input: {
  calendarEntryId: string;
  orderedAttachIds: string[];
}): Promise<void> {
  await requireAdmin();
  const { calendarEntryId, orderedAttachIds } = input;
  if (!calendarEntryId) throw new Error("Missing calendarEntryId");
  if (!Array.isArray(orderedAttachIds)) throw new Error("Missing order");

  // Defensive fetch: only touch rows that actually belong to this entry.
  // Guards against the client sending a mixed set of attach IDs (e.g.,
  // from a stale cache) and accidentally reassigning positions on another
  // entry's gallery. Prisma's `update` where needs the PK alone, so we
  // pre-validate scope here rather than in the where clause.
  const owned = await prisma.calendarEntryMedia.findMany({
    where: { calendarEntryId, id: { in: orderedAttachIds } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((o) => o.id));
  const validOrdering = orderedAttachIds.filter((id) => ownedSet.has(id));

  // One transaction, N updates. For v1 galleries this is fine (admin is
  // unlikely to have >20 photos per entry). If that assumption breaks we
  // can swap to `UPDATE ... FROM (VALUES ...)` via $executeRaw.
  await prisma.$transaction(
    validOrdering.map((id, index) =>
      prisma.calendarEntryMedia.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );

  revalidatePath(`/admin/calendar/${calendarEntryId}`);
  revalidatePath(`/calendar/${calendarEntryId}`);
}
