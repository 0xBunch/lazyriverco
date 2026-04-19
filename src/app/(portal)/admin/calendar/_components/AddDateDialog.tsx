"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { FocusTrap } from "@/components/FocusTrap";
import { createCalendarEntry } from "../actions";

// Add Date dialog. Replaces the always-visible 90-line dashed-border form
// that used to sit above the list — same fields, same server action, but
// behind an explicit affordance so the list is the page, not the form.
//
// Pattern mirrors LibraryAddModal: FocusTrap owns keyboard containment +
// Escape close + focus restore, backdrop click closes, server call goes
// through useTransition so we can catch errors inline instead of bubbling
// to the Next error boundary.

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddDateDialog({ open, onClose }: Props) {
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createCalendarEntry(fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bone-950/80 px-4 py-10 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FocusTrap
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-bone-800 bg-bone-950 p-6 shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        onEscape={onClose}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
              Calendar
            </p>
            <h2
              id={titleId}
              className="mt-1 font-display text-xl font-semibold tracking-tight text-bone-50"
            >
              Add a date
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex h-11 w-11 items-center justify-center rounded-md text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 motion-reduce:transition-none"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <Field label="Title" htmlFor="add-title">
              <input
                id="add-title"
                name="title"
                type="text"
                required
                autoFocus
                maxLength={200}
                placeholder="Lakers vs Warriors, Billy's birthday…"
                className={INPUT}
                disabled={isPending}
              />
            </Field>
            <Field label="Date" htmlFor="add-date">
              <input
                id="add-date"
                name="date"
                type="date"
                required
                className={INPUT}
                disabled={isPending}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recurrence" htmlFor="add-recurrence">
              <select
                id="add-recurrence"
                name="recurrence"
                defaultValue="none"
                className={INPUT}
                disabled={isPending}
              >
                <option value="none">One-time</option>
                <option value="annual">Annual — repeats every year</option>
              </select>
            </Field>
            <Field label="Time (optional)" htmlFor="add-time">
              <input
                id="add-time"
                name="time"
                type="text"
                maxLength={40}
                placeholder="7:00 PM, Noon, all day…"
                className={INPUT}
                disabled={isPending}
              />
            </Field>
          </div>

          <Field label="Tags" htmlFor="add-tags">
            <input
              id="add-tags"
              name="tags"
              type="text"
              maxLength={200}
              placeholder="comma, separated"
              className={INPUT}
              disabled={isPending}
            />
          </Field>

          <Field label="Description (optional)" htmlFor="add-description">
            <input
              id="add-description"
              name="description"
              type="text"
              maxLength={500}
              placeholder="Short summary — shown in agent context"
              className={INPUT}
              disabled={isPending}
            />
            <p className="mt-1 text-[11px] text-bone-300">
              Long-form body, video, and photos can be added after save on
              the full detail page.
            </p>
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-full border border-bone-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={cn(
                "rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400",
                isPending && "opacity-60",
              )}
            >
              {isPending ? "Adding…" : "Add date"}
            </button>
          </div>
        </form>
      </FocusTrap>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-bone-300">
        {label}
      </span>
      {children}
    </label>
  );
}

const INPUT =
  "w-full rounded-md border border-bone-800 bg-bone-900/60 px-3 py-2 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:opacity-60";
