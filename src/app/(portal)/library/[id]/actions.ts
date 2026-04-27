"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";

// useFormState-compatible state shape. Matches AdminLibraryState / the
// admin/ai/personas forms so client code using useFormState/useFormStatus
// reads the same way. `message` is empty on ok=true for postComment
// because the UI just clears the textarea and lets the new row render
// via revalidatePath.

export type LibraryCommentState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

const MAX_BODY_CHARS = 2000;

export async function postCommentAction(
  _prev: LibraryCommentState,
  fd: FormData,
): Promise<LibraryCommentState> {
  try {
    const user = await requireUser();

    const mediaId = fd.get("mediaId");
    const rawBody = fd.get("body");
    if (typeof mediaId !== "string" || !mediaId) {
      return { ok: false, error: "Missing media id." };
    }
    if (typeof rawBody !== "string") {
      return { ok: false, error: "Missing comment body." };
    }
    const body = rawBody.trim();
    if (!body) {
      return { ok: false, error: "Can't post an empty comment." };
    }
    if (body.length > MAX_BODY_CHARS) {
      return {
        ok: false,
        error: `Comments cap at ${MAX_BODY_CHARS} characters.`,
      };
    }

    await assertWithinLimit(user.id, "library.comment", {
      maxPerMinute: 10,
      maxPerDay: 300,
    });

    // Confirm the media row exists + isn't deleted. Hidden-from-grid
    // rows ARE commentable — the detail page is still reachable by id.
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, status: true },
    });
    if (!media || media.status === "DELETED") {
      return { ok: false, error: "That item is unavailable." };
    }

    await prisma.comment.create({
      data: {
        mediaId,
        userId: user.id,
        body,
      },
    });

    revalidatePath(`/library/${mediaId}`);
    return { ok: true, message: "" };
  } catch (e) {
    if (e instanceof RateLimitError) {
      return {
        ok: false,
        error: `Slow down — try again in ${e.retryAfterSeconds}s.`,
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Post failed.",
    };
  }
}

export async function deleteCommentAction(
  _prev: LibraryCommentState,
  fd: FormData,
): Promise<LibraryCommentState> {
  try {
    const viewer = await requireUser();

    const commentId = fd.get("commentId");
    const mediaId = fd.get("mediaId");
    if (typeof commentId !== "string" || !commentId) {
      return { ok: false, error: "Missing comment id." };
    }
    if (typeof mediaId !== "string" || !mediaId) {
      return { ok: false, error: "Missing media id." };
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, mediaId: true, deletedAt: true },
    });
    if (!comment) {
      return { ok: false, error: "Comment not found." };
    }
    if (comment.mediaId !== mediaId) {
      return { ok: false, error: "Comment/media mismatch." };
    }
    if (comment.deletedAt) {
      return { ok: false, error: "Already removed." };
    }
    if (comment.userId !== viewer.id && viewer.role !== "ADMIN") {
      return { ok: false, error: "Not your comment to remove." };
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    revalidatePath(`/library/${mediaId}`);
    return { ok: true, message: "Comment removed." };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Delete failed.",
    };
  }
}
