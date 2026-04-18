"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { $Enums } from "@prisma/client";
import { cn } from "@/lib/utils";
import { originLabel } from "@/lib/gallery-origin";
import {
  bulkDeleteAction,
  bulkHideAction,
  bulkHoFAction,
  bulkReanalyzeAction,
  bulkTagAction,
  type AdminGalleryState,
} from "@/app/(portal)/admin/gallery/actions";

export type AdminGalleryItem = {
  id: string;
  url: string;
  origin: $Enums.MediaOrigin;
  type: string;
  caption: string | null;
  originTitle: string | null;
  tags: string[];
  status: "PENDING" | "READY" | "DELETED";
  hallOfFame: boolean;
  hiddenFromGrid: boolean;
  createdAt: Date;
  uploadedBy: { id: string; displayName: string; name: string };
};

type Props = {
  items: AdminGalleryItem[];
};

export function AdminGalleryTable({ items }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = selected.size === items.length && items.length > 0;
  const someSelected = selected.size > 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  const clear = () => setSelected(new Set());

  return (
    <div className="space-y-4">
      <BulkActionBar selected={selected} onClear={clear} />

      <div className="overflow-x-auto rounded-xl border border-bone-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bone-800 bg-bone-900">
              <th scope="col" className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  aria-label={allSelected ? "Deselect all" : "Select all"}
                  className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-400"
                />
              </th>
              <ThHead>Thumb</ThHead>
              <ThHead>Caption / title</ThHead>
              <ThHead>Source</ThHead>
              <ThHead>Uploader</ThHead>
              <ThHead>Tags</ThHead>
              <ThHead>Status</ThHead>
              <ThHead>Added</ThHead>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="p-8 text-center text-sm italic text-bone-400"
                >
                  No items yet. Drop a photo above or paste a link from /gallery.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  checked={selected.has(item.id)}
                  onToggle={() => toggle(item.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ThHead({ children }: { children: ReactNode }) {
  return (
    <th
      scope="col"
      className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-bone-300"
    >
      {children}
    </th>
  );
}

function Row({
  item,
  checked,
  onToggle,
}: {
  item: AdminGalleryItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const headline = item.caption ?? item.originTitle ?? "—";
  return (
    <tr
      className={cn(
        "border-b border-bone-800/50 transition-colors",
        checked && "bg-claude-500/5",
        item.status === "DELETED" && "opacity-60",
      )}
    >
      <td className="p-3 align-middle">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${headline}`}
          className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-400"
        />
      </td>
      <td className="p-3 align-middle">
        <Link
          href={`/gallery/${item.id}`}
          target="_blank"
          className="block h-10 w-10 overflow-hidden rounded bg-bone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          aria-label="Open gallery detail in new tab"
        >
          {item.url && item.type !== "link" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] text-bone-500">
              —
            </span>
          )}
        </Link>
      </td>
      <td className="max-w-md truncate p-3 align-middle text-bone-100">
        {headline}
        {item.hallOfFame ? (
          <span className="ml-2" aria-label="Hall of Fame">⭐</span>
        ) : null}
        {item.hiddenFromGrid ? (
          <span className="ml-1 text-bone-400" aria-label="Hidden from grid">
            👁
          </span>
        ) : null}
      </td>
      <td className="p-3 align-middle text-bone-300">
        {originLabel(item.origin)}
      </td>
      <td className="p-3 align-middle text-bone-300">
        {item.uploadedBy.displayName}
      </td>
      <td className="max-w-xs truncate p-3 align-middle text-bone-300">
        {item.tags.length > 0 ? item.tags.join(", ") : "—"}
      </td>
      <td className="p-3 align-middle">
        <StatusBadge status={item.status} />
      </td>
      <td className="p-3 align-middle text-xs text-bone-300">
        {item.createdAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: AdminGalleryItem["status"] }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        status === "READY" && "bg-emerald-900/40 text-emerald-300",
        status === "PENDING" && "bg-amber-900/40 text-amber-300",
        status === "DELETED" && "bg-red-900/40 text-red-300",
      )}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Bulk action bar

function BulkActionBar({
  selected,
  onClear,
}: {
  selected: Set<string>;
  onClear: () => void;
}) {
  const ids = Array.from(selected);
  const disabled = ids.length === 0;

  const [deleteState, deleteAction] = useFormState(bulkDeleteAction, null);
  const [hideState, hideAction] = useFormState(bulkHideAction, null);
  const [hofState, hofAction] = useFormState(bulkHoFAction, null);
  const [tagState, tagAction] = useFormState(bulkTagAction, null);
  const [reanalyzeState, reanalyzeAction] = useFormState(
    bulkReanalyzeAction,
    null,
  );

  // Most-recent result wins the status row. If multiple actions fire in a
  // session, the last one is what the user cares about.
  const latest: AdminGalleryState =
    pickLatest([deleteState, hideState, hofState, tagState, reanalyzeState]) ??
    null;

  return (
    <div className="sticky top-4 z-10 space-y-3 rounded-xl border border-bone-800 bg-bone-900/80 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-bone-300">
          {ids.length} selected
        </span>

        <HiddenIds ids={ids} formId="bulk-hof-star" />
        <HiddenIds ids={ids} formId="bulk-hof-unstar" />
        <HiddenIds ids={ids} formId="bulk-hide" />
        <HiddenIds ids={ids} formId="bulk-unhide" />
        <HiddenIds ids={ids} formId="bulk-delete" />
        <HiddenIds ids={ids} formId="bulk-tag" />
        <HiddenIds ids={ids} formId="bulk-reanalyze" />

        <form id="bulk-hof-star" action={hofAction} className="contents">
          <input type="hidden" name="star" value="true" />
          <SubmitButton disabled={disabled} kind="secondary">⭐ Star</SubmitButton>
        </form>
        <form id="bulk-hof-unstar" action={hofAction} className="contents">
          <input type="hidden" name="star" value="false" />
          <SubmitButton disabled={disabled} kind="secondary">Unstar</SubmitButton>
        </form>
        <form id="bulk-hide" action={hideAction} className="contents">
          <input type="hidden" name="hide" value="true" />
          <SubmitButton disabled={disabled} kind="secondary">Hide</SubmitButton>
        </form>
        <form id="bulk-unhide" action={hideAction} className="contents">
          <input type="hidden" name="hide" value="false" />
          <SubmitButton disabled={disabled} kind="secondary">Unhide</SubmitButton>
        </form>
        <form id="bulk-reanalyze" action={reanalyzeAction} className="contents">
          <SubmitButton disabled={disabled} kind="secondary">
            Re-analyze (AI)
          </SubmitButton>
        </form>
        <form id="bulk-delete" action={deleteAction} className="contents">
          <SubmitButton disabled={disabled} kind="danger">Delete</SubmitButton>
        </form>

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-bone-400 transition-colors hover:text-bone-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear selection
        </button>
      </div>

      <form
        id="bulk-tag"
        action={tagAction}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor="bulk-tag-input" className="sr-only">
          Tag to add or remove
        </label>
        <input
          id="bulk-tag-input"
          name="tag"
          type="text"
          placeholder="tag-name"
          maxLength={40}
          className="flex-1 min-w-[200px] rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
        <button
          type="submit"
          name="mode"
          value="add"
          disabled={disabled}
          className={btnClasses("secondary")}
        >
          + Add tag
        </button>
        <button
          type="submit"
          name="mode"
          value="remove"
          disabled={disabled}
          className={btnClasses("secondary")}
        >
          − Remove tag
        </button>
      </form>

      {latest ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "text-sm",
            latest.ok ? "text-emerald-300" : "text-red-300",
          )}
        >
          {latest.ok ? latest.message : latest.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Render hidden mediaIds inputs INSIDE the target form using the form="..."
 * attribute. Avoids duplicating N hidden inputs across every action form
 * (~6 forms × up to 200 ids = 1200 DOM nodes). With form=, each id appears
 * once per form association but the React rendering is N, not N×6.
 */
function HiddenIds({ ids, formId }: { ids: string[]; formId: string }) {
  return (
    <>
      {ids.map((id) => (
        <input
          key={`${formId}-${id}`}
          type="hidden"
          name="mediaIds"
          value={id}
          form={formId}
        />
      ))}
    </>
  );
}

function SubmitButton({
  children,
  disabled,
  kind,
}: {
  children: ReactNode;
  disabled: boolean;
  kind: "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={btnClasses(kind)}
    >
      {children}
    </button>
  );
}

function btnClasses(kind: "secondary" | "danger") {
  if (kind === "danger") {
    return "rounded-md border border-red-800 bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-40";
  }
  return "rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-xs font-medium text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-40";
}

function pickLatest(
  states: (AdminGalleryState | null)[],
): AdminGalleryState | null {
  // States are the last-fired-action's result; when they're `null` the
  // action hasn't been invoked yet in this session. Return the last
  // non-null state (arbitrary across multiple non-null; in practice only
  // one action fires at a time).
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i]) return states[i];
  }
  return null;
}
