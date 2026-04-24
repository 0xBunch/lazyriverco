"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  putGeneratedImageBytes,
  isAllowedContentType,
} from "@/lib/r2";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — matches putGeneratedImageBytes cap.

function flash(path: string, key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${path}?${q}`);
}

export async function uploadAnnouncerImage(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const label = String(fd.get("label") ?? "").trim() || null;
  const file = fd.get("image");
  const base = `/admin/draft/${draftId}/images`;

  if (!draftId) flash("/admin/draft", "error", "Missing draft id.");
  if (!(file instanceof File)) flash(base, "error", "No file uploaded.");
  if (!isAllowedContentType(file.type)) {
    flash(base, "error", `File type "${file.type || "unknown"}" not allowed.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    flash(base, "error", `File exceeds 10 MB.`);
  }

  const bytes = await file.arrayBuffer();

  let key: string;
  try {
    const put = await putGeneratedImageBytes(bytes, file.type);
    key = put.key;
  } catch (e) {
    flash(
      base,
      "error",
      `Upload to R2 failed: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }

  await prisma.draftAnnouncerImage.create({
    data: { draftId, r2Key: key, label, uploadedBy: admin.id },
  });

  revalidatePath(base);
  redirect(`${base}?msg=uploaded`);
}

export async function deleteAnnouncerImage(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const base = `/admin/draft/${draftId}/images`;
  if (!id) flash(base, "error", "Missing image id.");
  // Just remove the DB row; R2 object stays (admin-only garbage is tolerable).
  await prisma.draftAnnouncerImage.delete({ where: { id } });
  revalidatePath(base);
  redirect(`${base}?msg=deleted`);
}

export async function resetRotation(fd: FormData): Promise<void> {
  await requireAdmin();
  const draftId = String(fd.get("draftId") ?? "").trim();
  const base = `/admin/draft/${draftId}/images`;
  if (!draftId) flash("/admin/draft", "error", "Missing draft id.");

  const updated = await prisma.draftAnnouncerImage.updateMany({
    where: { draftId, consumedPickId: { not: null } },
    data: { consumedPickId: null },
  });

  revalidatePath(base);
  redirect(`${base}?msg=${encodeURIComponent(`Reset ${updated.count} images — all eligible for the next pick.`)}`);
}
