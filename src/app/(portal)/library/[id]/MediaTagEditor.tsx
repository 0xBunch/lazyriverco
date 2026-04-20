"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  addTagToMediaAction,
  removeTagFromMediaAction,
  type MetaResult,
} from "@/app/(portal)/library/actions";

// Tag row on the library detail page. Has two modes:
// - view (default): filter-link chips matching the existing member-
//   facing behavior. Clicking a chip navigates to /library/t/{tag}.
// - edit (admin + uploader only): chips get a × button for removal +
//   an inline input for adding a new slug. An "Edit / Done" toggle
//   flips between the two modes so a stray click can't un-tag or
//   retype mid-browse.
//
// Remove strips from both `tags` and `aiTags`: the user's mental
// model is "make this tag go away from this picture," not "hide it
// until the next AI pass." Add writes to `tags` only — `aiTags` is
// the model's audit trail and shouldn't reflect human edits.

type Props = {
  mediaId: string;
  tags: string[];
  canEdit: boolean;
};

type LastKind = "add" | "remove" | null;

export function MediaTagEditor({ mediaId, tags, canEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [lastKind, setLastKind] = useState<LastKind>(null);
  const [removeState, removeAction] = useFormState<MetaResult | null, FormData>(
    removeTagFromMediaAction,
    null,
  );
  const [addState, addAction] = useFormState<MetaResult | null, FormData>(
    addTagToMediaAction,
    null,
  );

  // View mode with no tags + no edit rights: render nothing.
  if (tags.length === 0 && !canEdit) return null;

  // Surface whichever action the user most recently submitted. Prevents
  // a stale add-error from covering a later remove-error (or vice versa).
  const lastState =
    lastKind === "add" ? addState : lastKind === "remove" ? removeState : null;

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) =>
          editing ? (
            <form
              key={tag}
              action={removeAction}
              onSubmit={() => setLastKind("remove")}
              className="contents"
            >
              <input type="hidden" name="mediaId" value={mediaId} />
              <input type="hidden" name="tag" value={tag} />
              <RemoveChip tag={tag} />
            </form>
          ) : (
            <Link
              key={tag}
              href={`/library/t/${encodeURIComponent(tag)}`}
              className="rounded-full bg-bone-900 px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-bone-200 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
            >
              #{tag}
            </Link>
          ),
        )}
        {canEdit && editing ? (
          <AddTagForm
            mediaId={mediaId}
            action={addAction}
            state={addState}
            onSubmit={() => setLastKind("add")}
          />
        ) : null}
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
            {editing ? "Done" : tags.length === 0 ? "Add tag" : "Edit"}
          </button>
        ) : null}
      </div>

      {lastState && !lastState.ok ? (
        <p role="status" aria-live="polite" className="mt-2 text-xs text-red-300">
          {lastState.error}
        </p>
      ) : null}
    </div>
  );
}

function AddTagForm({
  mediaId,
  action,
  state,
  onSubmit,
}: {
  mediaId: string;
  action: (fd: FormData) => void;
  state: MetaResult | null;
  onSubmit: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Key on the state object's identity, not a derived boolean — useFormState
  // returns a fresh object each dispatch, so this re-fires on every
  // consecutive successful add (chain-tagging). A boolean `success` dep
  // would stay true across back-to-back oks and skip the reset.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={onSubmit}
      className="contents"
    >
      <input type="hidden" name="mediaId" value={mediaId} />
      <label className="sr-only" htmlFor={`add-tag-${mediaId}`}>
        Add tag
      </label>
      <div className="inline-flex items-center gap-1 rounded-full border border-claude-500/40 bg-claude-500/5 px-2 py-1 focus-within:border-claude-400 focus-within:bg-claude-500/10">
        <span aria-hidden className="text-[0.65rem] font-medium uppercase tracking-wider text-claude-300">
          #
        </span>
        <input
          ref={inputRef}
          id={`add-tag-${mediaId}`}
          name="tag"
          type="text"
          required
          placeholder="add tag"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={40}
          pattern="[a-z0-9][a-z0-9\-_]*"
          className="w-24 bg-transparent text-[0.65rem] font-medium uppercase tracking-wider text-bone-100 placeholder:text-bone-500 focus:outline-none"
        />
        <AddSubmitButton />
      </div>
    </form>
  );
}

function AddSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Add tag"
      className={cn(
        "text-[0.65rem] font-medium uppercase tracking-wider text-claude-300 transition-colors",
        "hover:text-claude-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950 rounded-sm",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {pending ? "…" : "+"}
    </button>
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
