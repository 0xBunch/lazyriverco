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

export async function createCalendarEntry(
  formData: FormData,
): Promise<void> {
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
      description:
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
    },
  });

  revalidatePath("/admin/calendar");
}

export async function updateCalendarEntry(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  const title = formData.get("title");
  const date = formData.get("date");
  const recurrence = formData.get("recurrence");
  const tagsRaw = formData.get("tags");
  const description = formData.get("description");

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
      description:
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
    },
  });

  revalidatePath("/admin/calendar");
}

export async function deleteCalendarEntry(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing id");

  await prisma.calendarEntry.delete({ where: { id } });

  revalidatePath("/admin/calendar");
}
