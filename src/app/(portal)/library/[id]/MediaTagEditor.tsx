"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  removeTagFromMediaAction,
  type MetaResult,
} from "@/app/(portal)/library/actions";

// Tag row on the library detail page. Has two modes:
// - view (default): filter-link chips matching the existing member-
//   facing behavior. Clicking a chip navigates to /library?tag=x.
// - edit (admin + uploader only): chips get a × button; clicking
//   removes the tag from this media's `tags` + `aiTags` via the
//   server action. An "Edit / Done" toggle flips between the two
//   modes so a stray click can't un-tag mid-browse.
//
// Strips from both columns: the user's mental model is "make this
// tag go away from this picture," not "hide it until the next AI
// pass." Matches the ban-flow sweep semantics.

type Props = {
  mediaId: string;
  tags: string[];
  canEdit: boolean;
};

export function MediaTagEditor({ mediaId, tags, canEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useFormState<MetaResult | null, FormData>(
    removeTagFromMediaAction,
    null,
  );

  if (tags.length === 0 && !canEdit) return null;

  if (tags.length === 0) {
    // Empty state but still editable — nothing to remove, so no editor.
    // Keep this slot reserved in case a future revision adds an "add
    // tag" input on the detail page.
    return null;
  }

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) =>
          editing ? (
            <form key={tag} action={action} className="contents">
              <input type="hidden" name="mediaId" value={mediaId} />
              <input type="hidden" name="tag" value={tag} />
              <RemoveChip tag={tag} />
            </form>
          ) : (
            <Link
              key={tag}
              href={`/library?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-bone-900 px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-bone-200 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
            >
              #{tag}
            </Link>
          ),
        )}
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-wider transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              editing
                ? "border-claude-500/60 bg-claude-500/10 text-claude-200 hover:bg-claude-500/20"
                : "border-bone-700 bg-transparent text-bone-400 hover:border-bone-600 hover:text-bone-200",
            )}
          >
            {editing ? "Done" : "Edit"}
          </button>
        ) : null}
      </div>

      {state && !state.ok ? (
        <p role="status" aria-live="polite" className="mt-2 text-xs text-red-300">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function RemoveChip({ tag }: { tag: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Remove tag ${tag}`}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border border-red-900/60 bg-red-950/20 px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-red-100 transition-colors",
        "hover:border-red-600/70 hover:bg-red-900/40",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <span>#{tag}</span>
      <span
        aria-hidden
        className="text-red-300 transition-colors group-hover:text-red-100"
      >
        ×
      </span>
    </button>
  );
}
