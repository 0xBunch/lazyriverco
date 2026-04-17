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

  if (typeof id !== "string" || !id) throw new Error("Missing id");
  if (typeof title !== "string" || !title.trim()) throw new Error("Title is required");
  if (typeof date !== "string" || !date) throw new Error("Date is required");

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) throw new Error("Invalid date");

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
