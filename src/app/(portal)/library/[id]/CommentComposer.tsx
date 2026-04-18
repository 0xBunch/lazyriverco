"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  postCommentAction,
  deleteCommentAction,
  type LibraryCommentState,
} from "./actions";

// Composer — used once per detail page at the top of the comment
// section. Uncontrolled textarea + form.reset() on successful post so
// typing state is local and the posted row renders via revalidatePath.

export function CommentComposer({ mediaId }: { mediaId: string }) {
  const [state, formAction] = useFormState<LibraryCommentState, FormData>(
    postCommentAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const errorMessage = state && state.ok === false ? state.error : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-2"
      aria-label="Add a comment"
    >
      <input type="hidden" name="mediaId" value={mediaId} />
      <label htmlFor="comment-body" className="sr-only">
        Add a comment
      </label>
      <textarea
        id="comment-body"
        name="body"
        required
        maxLength={2000}
        rows={3}
        placeholder="Say something about this…"
        className="w-full rounded-lg border border-bone-800/60 bg-bone-900/40 px-3 py-2 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      />
      <div className="flex items-center justify-between gap-3">
        {errorMessage ? (
          <p className="text-xs text-red-300" role="alert">
            {errorMessage}
          </p>
        ) : (
          <span />
        )}
        <PostButton />
      </div>
    </form>
  );
}

function PostButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-claude-200 transition-colors hover:bg-claude-500/20 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
    >
      {pending ? "Posting…" : "Post"}
    </button>
  );
}

// Tiny inline form for removing a comment. Rendered once per comment
// the viewer is allowed to remove. Uses useFormState so failures
// surface inline rather than as Next's anonymized digest in prod.

export function DeleteCommentForm({
  commentId,
  mediaId,
}: {
  commentId: string;
  mediaId: string;
}) {
  const [state, formAction] = useFormState<LibraryCommentState, FormData>(
    deleteCommentAction,
    null,
  );
  const errorMessage = state && state.ok === false ? state.error : null;

  return (
    <form action={formAction} className="mt-1 inline-flex items-center gap-2">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="mediaId" value={mediaId} />
      <DeleteButton />
      {errorMessage ? (
        <span className="text-[11px] text-red-300" role="alert">
          {errorMessage}
        </span>
      ) : null}
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded text-[11px] uppercase tracking-wider text-bone-400 underline decoration-transparent underline-offset-2 transition-colors hover:text-bone-200 hover:decoration-bone-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
