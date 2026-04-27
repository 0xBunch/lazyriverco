"use client";

import { useFormState, useFormStatus } from "react-dom";
import { reanalyzeOneAction } from "@/app/(portal)/admin/memory/library/actions";

// Admin-only "Re-analyze tags" button on the library detail page. Kicks off
// a background Gemini vision run on the item (bypasses the aiAnalyzedAt
// idempotence guard — that guard only exists on the member upload path to
// prevent re-charging on edit). Soft-fails surface as the inline message.

export function AdminReanalyzeButton({ mediaId }: { mediaId: string }) {
  const [state, formAction] = useFormState(reanalyzeOneAction, null);

  return (
    <form action={formAction} className="mt-12 border-t border-bone-800 pt-6">
      <input type="hidden" name="mediaId" value={mediaId} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        {state ? (
          <p
            role="status"
            aria-live="polite"
            className={
              state.ok
                ? "text-xs text-emerald-300"
                : "text-xs text-red-300"
            }
          >
            {state.ok ? state.message : state.error}
          </p>
        ) : (
          <p className="text-xs italic text-bone-400">
            Reruns Gemini vision on this item. Existing tags are kept; AI tags
            are merged in. Takes ~15s.
          </p>
        )}
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-xs font-medium text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Queuing…" : "🪄 Re-analyze tags"}
    </button>
  );
}
