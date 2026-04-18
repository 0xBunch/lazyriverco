"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BANNED_LABEL } from "@/lib/taxonomy-constants";
import {
  addTagAction,
  assignTagBucketAction,
  bulkImportTagsAction,
  deleteTagAction,
  updateTagMetaAction,
  type AdminTaxonomyState,
} from "./actions";

// /admin/taxonomy registry view. One table, every tag. Bucket filter
// chips up top + search + bulk import. Click a row to expand an inline
// editor (description, bucket reassign, ban, delete). Every write goes
// through a server action and pending states are scoped to the form
// that fired, so the table never flickers globally.

export type BucketOption = { id: string; label: string };

export type TagRow = {
  slug: string;
  label: string | null;
  description: string | null;
  bucketId: string | null;
  bucketLabel: string | null; // denormalized for rendering
  uses: number;
};

type FilterKey = "all" | "uncategorized" | string; // string = bucketId

export function TagRegistry({
  buckets,
  rows,
}: {
  buckets: BucketOption[];
  rows: TagRow[];
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const counts = useMemo(() => {
    const byBucket = new Map<string, number>();
    let uncategorized = 0;
    for (const r of rows) {
      if (r.bucketId) {
        byBucket.set(r.bucketId, (byBucket.get(r.bucketId) ?? 0) + 1);
      } else {
        uncategorized++;
      }
    }
    return { byBucket, uncategorized };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.slug.includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "uncategorized") return r.bucketId === null;
      return r.bucketId === filter;
    });
  }, [rows, query, filter]);

  // Sort: most-used first (what the admin usually wants to look at),
  // then alphabetical for stability.
  const sortedRows = useMemo(
    () =>
      [...filteredRows].sort(
        (a, b) => b.uses - a.uses || a.slug.localeCompare(b.slug),
      ),
    [filteredRows],
  );

  return (
    <div className="space-y-5">
      <BulkImportBar buckets={buckets} />

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          count={rows.length}
        >
          All
        </FilterChip>
        {buckets.map((b) => (
          <FilterChip
            key={b.id}
            active={filter === b.id}
            onClick={() => setFilter(b.id)}
            count={counts.byBucket.get(b.id) ?? 0}
            tone={b.label === BANNED_LABEL ? "banned" : "default"}
          >
            {b.label}
          </FilterChip>
        ))}
        <FilterChip
          active={filter === "uncategorized"}
          onClick={() => setFilter("uncategorized")}
          count={counts.uncategorized}
        >
          Uncategorized
        </FilterChip>

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="tag-search" className="sr-only">
            Search tags
          </label>
          <input
            id="tag-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slugs…"
            className="min-w-[220px] rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-bone-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bone-800 bg-bone-900">
              <ThHead className="w-1/3">Slug</ThHead>
              <ThHead className="w-20 text-right">Uses</ThHead>
              <ThHead className="w-48">Bucket</ThHead>
              <ThHead>Description</ThHead>
              <ThHead className="w-16"></ThHead>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="p-6 text-center text-sm italic text-bone-400"
                >
                  No tags match. {query ? "Clear the search" : "Add one above"}.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <TagTableRow
                  key={row.slug}
                  row={row}
                  buckets={buckets}
                  expanded={expandedSlug === row.slug}
                  onToggle={() =>
                    setExpandedSlug((s) => (s === row.slug ? null : row.slug))
                  }
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

function TagTableRow({
  row,
  buckets,
  expanded,
  onToggle,
}: {
  row: TagRow;
  buckets: BucketOption[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const bucketLabel = row.bucketLabel ?? "Uncategorized";
  const isBanned = bucketLabel === BANNED_LABEL;

  return (
    <>
      <tr
        className={cn(
          "border-b border-bone-800/50 transition-colors",
          expanded && "bg-claude-500/5",
          isBanned && "bg-red-950/20",
        )}
      >
        <td className="px-4 py-2.5 align-middle">
          <button
            type="button"
            onClick={onToggle}
            className="font-mono text-bone-100 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-900"
            aria-expanded={expanded}
          >
            {row.slug}
          </button>
        </td>
        <td className="px-4 py-2.5 text-right align-middle tabular-nums text-bone-300">
          {row.uses}
        </td>
        <td className="px-4 py-2.5 align-middle">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              row.bucketId === null && "bg-bone-800 text-bone-400",
              row.bucketId !== null &&
                !isBanned &&
                "bg-claude-500/15 text-claude-200",
              isBanned && "bg-red-900/40 text-red-200",
            )}
          >
            {bucketLabel}
          </span>
        </td>
        <td className="px-4 py-2.5 align-middle text-bone-300 max-w-md truncate">
          {row.description ? (
            <span className="text-pretty">{row.description}</span>
          ) : (
            <span className="italic text-bone-500">—</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right align-middle">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md px-2 py-1 text-xs font-medium text-bone-400 transition-colors hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            aria-label={expanded ? `Collapse ${row.slug}` : `Edit ${row.slug}`}
          >
            {expanded ? "Close" : "Edit"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-bone-800 bg-bone-900/40">
          <td colSpan={5} className="px-4 py-4">
            <TagEditor row={row} buckets={buckets} onDone={onToggle} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function TagEditor({
  row,
  buckets,
  onDone,
}: {
  row: TagRow;
  buckets: BucketOption[];
  onDone: () => void;
}) {
  const [metaState, metaAction] = useFormState(updateTagMetaAction, null);
  const [bucketState, bucketAction] = useFormState(assignTagBucketAction, null);
  const [deleteState, deleteAction] = useFormState(deleteTagAction, null);

  return (
    <div className="space-y-4">
      <form action={bucketAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="slug" value={row.slug} />
        <div>
          <label
            htmlFor={`bucket-${row.slug}`}
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
          >
            Bucket
          </label>
          <select
            id={`bucket-${row.slug}`}
            name="bucketId"
            defaultValue={row.bucketId ?? ""}
            className="min-w-[180px] rounded-md border border-bone-800 bg-bone-950 px-2 py-1.5 text-sm text-bone-100 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          >
            <option value="">Uncategorized</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton kind="secondary">Apply bucket</SubmitButton>
        {bucketState ? <StatusLine state={bucketState} /> : null}
      </form>

      <form action={metaAction} className="space-y-3">
        <input type="hidden" name="slug" value={row.slug} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`label-${row.slug}`}
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
            >
              Label (optional)
            </label>
            <input
              id={`label-${row.slug}`}
              name="label"
              type="text"
              defaultValue={row.label ?? ""}
              placeholder={row.slug.replace(/-/g, " ")}
              maxLength={80}
              className="w-full rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            />
          </div>
          <div className="flex items-end justify-end gap-2">
            <SubmitButton kind="primary">Save</SubmitButton>
            <button
              type="button"
              onClick={onDone}
              className="rounded-md border border-bone-800 bg-transparent px-3 py-1.5 text-xs font-medium text-bone-300 transition-colors hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            >
              Close
            </button>
          </div>
        </div>
        <div>
          <label
            htmlFor={`desc-${row.slug}`}
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
          >
            Description
          </label>
          <textarea
            id={`desc-${row.slug}`}
            name="description"
            defaultValue={row.description ?? ""}
            rows={3}
            maxLength={500}
            placeholder="What this tag means. Why it exists. What else it relates to."
            className="w-full rounded-md border border-bone-800 bg-bone-900/60 px-3 py-2 text-sm text-bone-100 placeholder:text-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          />
        </div>
        {metaState ? <StatusLine state={metaState} /> : null}
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t border-bone-800 pt-3">
        <span className="text-xs text-bone-400">Danger zone:</span>
        <form action={deleteAction} className="contents">
          <input type="hidden" name="slug" value={row.slug} />
          <DeleteButton slug={row.slug} uses={row.uses} />
        </form>
        {deleteState ? <StatusLine state={deleteState} /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BulkImportBar({ buckets }: { buckets: BucketOption[] }) {
  const [addState, addAction] = useFormState(addTagAction, null);
  const [importState, importAction] = useFormState(bulkImportTagsAction, null);

  return (
    <details
      open
      className="group rounded-2xl border border-bone-800 bg-bone-900/40 open:bg-bone-900/60"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between rounded-2xl px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.18em] text-claude-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400">
        <span>Add / import tags</span>
        <span className="text-bone-400 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="space-y-5 px-5 pb-5">
        <form
          action={addAction}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex-1 min-w-[220px]">
            <label
              htmlFor="single-add-slug"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
            >
              Add one
            </label>
            <input
              id="single-add-slug"
              name="slug"
              type="text"
              placeholder="new-slug"
              maxLength={40}
              autoComplete="off"
              className="w-full rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            />
          </div>
          <div>
            <label
              htmlFor="single-add-bucket"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
            >
              Into bucket
            </label>
            <select
              id="single-add-bucket"
              name="bucketId"
              defaultValue=""
              className="min-w-[160px] rounded-md border border-bone-800 bg-bone-950 px-2 py-1.5 text-sm text-bone-100 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            >
              <option value="">Uncategorized</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton kind="secondary">Add tag</SubmitButton>
          {addState ? <StatusLine state={addState} /> : null}
        </form>

        <form action={importAction} className="space-y-2">
          <label
            htmlFor="bulk-slugs"
            className="block text-xs font-semibold uppercase tracking-wider text-bone-300"
          >
            Or paste many (comma or newline, ≤100)
          </label>
          <textarea
            id="bulk-slugs"
            name="slugs"
            rows={3}
            placeholder={`luka-doncic, lebron-james\npatrick-mahomes\n…`}
            className="w-full rounded-md border border-bone-800 bg-bone-900/60 px-3 py-2 font-mono text-sm text-bone-100 placeholder:text-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          />
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor="bulk-bucket"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
              >
                Assign all to
              </label>
              <select
                id="bulk-bucket"
                name="bucketId"
                defaultValue=""
                className="min-w-[160px] rounded-md border border-bone-800 bg-bone-950 px-2 py-1.5 text-sm text-bone-100 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
              >
                <option value="">Uncategorized</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton kind="secondary">Import</SubmitButton>
            {importState ? <StatusLine state={importState} /> : null}
          </div>
        </form>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------

function FilterChip({
  children,
  active,
  onClick,
  count,
  tone = "default",
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  count: number;
  tone?: "default" | "banned";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
        active
          ? tone === "banned"
            ? "border-red-600 bg-red-950/60 text-red-100"
            : "border-claude-500 bg-claude-500/10 text-claude-100"
          : tone === "banned"
            ? "border-red-900/40 bg-transparent text-red-300 hover:bg-red-950/30"
            : "border-bone-700 bg-transparent text-bone-300 hover:text-bone-100",
      )}
    >
      <span>{children}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function ThHead({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-bone-300",
        className,
      )}
    >
      {children}
    </th>
  );
}

function SubmitButton({
  children,
  kind,
}: {
  children: ReactNode;
  kind: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-40",
        kind === "primary" &&
          "border-claude-500/60 bg-claude-500/15 text-claude-100 hover:bg-claude-500/25",
        kind === "secondary" &&
          "border-bone-800 bg-bone-900/60 text-bone-200 hover:text-bone-50",
      )}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function DeleteButton({ slug, uses }: { slug: string; uses: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        // Native confirm — server-side action is the real gate, this
        // just guards against a fat-finger. Per-row so the message can
        // cite the real count.
        const msg =
          uses > 0
            ? `Delete "${slug}" and strip it from ${uses} library item${uses === 1 ? "" : "s"}? This can't be undone (you'd have to re-add it from scratch).`
            : `Delete "${slug}"? Not attached to any library items.`;
        if (!window.confirm(msg)) e.preventDefault();
      }}
      className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Deleting…" : "Delete tag"}
    </button>
  );
}

function StatusLine({ state }: { state: AdminTaxonomyState }) {
  if (!state) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "text-xs",
        state.ok ? "text-emerald-300" : "text-red-300",
      )}
    >
      {state.ok ? state.message : state.error}
    </span>
  );
}
