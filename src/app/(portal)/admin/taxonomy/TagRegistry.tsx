"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { BANNED_LABEL } from "@/lib/taxonomy-constants";
import {
  addBucketAction,
  addTagAction,
  assignTagBucketAction,
  bulkAssignBucketAction,
  bulkDeleteTagsAction,
  bulkImportTagsAction,
  classifyUncategorizedAction,
  deleteTagAction,
  updateBucketAction,
  updateTagMetaAction,
  type AdminTaxonomyState,
} from "./actions";

// /admin/taxonomy registry view. One table, every tag. Bucket filter
// chips up top + search + bulk import. Click a row to expand an inline
// editor (description, bucket reassign, ban, delete). Every write goes
// through a server action and pending states are scoped to the form
// that fired, so the table never flickers globally.

export type BucketOption = {
  id: string;
  label: string;
  description: string | null;
};

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
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  // Prune selection when rows change (e.g. after a bulk delete, deleted
  // slugs shouldn't linger in the selection Set). The action-bar also
  // clears on ok:true via useEffect below, so this is belt-and-suspenders.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const registered = new Set(rows.map((r) => r.slug));
      let changed = false;
      const next = new Set<string>();
      for (const s of prev) {
        if (registered.has(s)) next.add(s);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const filteredSlugs = useMemo(() => sortedRows.map((r) => r.slug), [sortedRows]);

  const allFilteredSelected =
    filteredSlugs.length > 0 && filteredSlugs.every((s) => selected.has(s));
  const someFilteredSelected =
    !allFilteredSelected && filteredSlugs.some((s) => selected.has(s));

  function toggleOne(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const s of filteredSlugs) next.delete(s);
      } else {
        for (const s of filteredSlugs) next.add(s);
      }
      return next;
    });
  }
  // Stable across renders so `BulkActionBar`'s useEffect deps don't
  // re-subscribe every parent render.
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  // After a bulk op commits, drop ONLY the slugs we just submitted —
  // not the whole selection. If the admin selected more tags while the
  // server action was in flight, those stay selected. This is the
  // correct semantic for a "I acted on THESE" operation.
  const removeFromSelection = useCallback((slugs: readonly string[]) => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const s of slugs) {
        if (next.delete(s)) changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  return (
    <div className="space-y-5">
      <BucketEditor buckets={buckets} />

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
        <ClassifyUncategorizedButton count={counts.uncategorized} />

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
              <ThHead className="w-10">
                <SelectAllCheckbox
                  checked={allFilteredSelected}
                  indeterminate={someFilteredSelected}
                  onChange={toggleAllFiltered}
                  disabled={filteredSlugs.length === 0}
                />
              </ThHead>
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
                  colSpan={6}
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
                  selected={selected.has(row.slug)}
                  onToggleSelect={() => toggleOne(row.slug)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected.size > 0 ? (
        <BulkActionBar
          buckets={buckets}
          selectedSlugs={Array.from(selected)}
          onClear={clearSelection}
          onCommitted={removeFromSelection}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TagTableRow({
  row,
  buckets,
  expanded,
  onToggle,
  selected,
  onToggleSelect,
}: {
  row: TagRow;
  buckets: BucketOption[];
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const bucketLabel = row.bucketLabel ?? "Uncategorized";
  const isBanned = bucketLabel === BANNED_LABEL;

  return (
    <>
      <tr
        className={cn(
          "border-b border-bone-800/50 transition-colors",
          expanded && "bg-claude-500/5",
          selected && !expanded && "bg-claude-500/[0.03]",
          isBanned && "bg-red-950/20",
        )}
      >
        <td className="px-4 py-2.5 align-middle">
          <RowCheckbox
            slug={row.slug}
            checked={selected}
            onChange={onToggleSelect}
          />
        </td>
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
          <td colSpan={6} className="px-4 py-4">
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
    <details className="group rounded-2xl border border-bone-800 bg-bone-900/40 open:bg-bone-900/60">
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
            ? `Delete "${slug}" and strip it from ${uses} gallery item${uses === 1 ? "" : "s"}? This can't be undone (you'd have to re-add it from scratch).`
            : `Delete "${slug}"? Not attached to any gallery items.`;
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

// ---------------------------------------------------------------------------
// Bulk selection + action bar

function RowCheckbox({
  slug,
  checked,
  onChange,
}: {
  slug: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <span className="sr-only">Select {slug}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer rounded border-bone-700 bg-bone-900 accent-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      />
    </label>
  );
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  // indeterminate is a DOM-only property — React has no prop for it.
  // useRef + useEffect (not a ref callback) so the property syncs on
  // EVERY re-render when the value changes, not just on mount.
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="inline-flex cursor-pointer items-center">
      <span className="sr-only">Select all visible tags</span>
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-checked={indeterminate ? "mixed" : checked}
        className="h-4 w-4 cursor-pointer rounded border-bone-700 bg-bone-900 accent-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </label>
  );
}

function BulkActionBar({
  buckets,
  selectedSlugs,
  onClear,
  onCommitted,
}: {
  buckets: BucketOption[];
  selectedSlugs: string[];
  onClear: () => void;
  onCommitted: (slugs: readonly string[]) => void;
}) {
  const [assignState, assignAction] = useFormState(
    bulkAssignBucketAction,
    null,
  );
  const [deleteState, deleteAction] = useFormState(
    bulkDeleteTagsAction,
    null,
  );
  const bannedBucket = buckets.find((b) => b.label === BANNED_LABEL);

  // Snapshot the slugs we actually submitted. When the server action
  // resolves, we clear only those from the selection — NOT the whole
  // set. If the admin added more tags while the call was in flight,
  // those stay selected. `assignCommitRef` / `deleteCommitRef` are
  // keyed to the most recent submission of each action; the effects
  // drain the ref after applying it to avoid double-applying.
  const assignCommitRef = useRef<readonly string[] | null>(null);
  const deleteCommitRef = useRef<readonly string[] | null>(null);

  useEffect(() => {
    if (assignState?.ok && assignCommitRef.current) {
      onCommitted(assignCommitRef.current);
      assignCommitRef.current = null;
    }
  }, [assignState, onCommitted]);
  useEffect(() => {
    if (deleteState?.ok && deleteCommitRef.current) {
      onCommitted(deleteCommitRef.current);
      deleteCommitRef.current = null;
    }
  }, [deleteState, onCommitted]);

  const count = selectedSlugs.length;
  const countId = "bulk-action-count";

  // Toolbar-flush treatment: anchored at the bottom as a horizontal
  // band instead of a centered floating capsule. Reads as a workflow
  // toolbar, not a hero ornament.
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 border-t border-claude-500/30 bg-bone-900/95 px-4 py-3 backdrop-blur"
    >
      <span id={countId} className="text-sm font-medium text-claude-200">
        {count} selected
      </span>

      <form
        action={assignAction}
        onSubmit={() => {
          assignCommitRef.current = selectedSlugs.slice();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        {selectedSlugs.map((s) => (
          <input key={s} type="hidden" name="slug" value={s} />
        ))}
        <label htmlFor="bulk-move-bucket" className="sr-only">
          Move to bucket
        </label>
        <select
          id="bulk-move-bucket"
          name="bucketId"
          defaultValue=""
          className="rounded-md border border-bone-800 bg-bone-950 px-2 py-1.5 text-xs text-bone-100 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        >
          <option value="">Uncategorized</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <SubmitButton kind="primary">Move</SubmitButton>
      </form>

      {bannedBucket ? (
        <form
          action={assignAction}
          onSubmit={(e) => {
            const ok = window.confirm(
              `Ban ${count} tag${count === 1 ? "" : "s"} and strip them from all gallery items? Banning is one-way — unbanning does NOT restore removed tags.`,
            );
            if (!ok) {
              e.preventDefault();
              return;
            }
            assignCommitRef.current = selectedSlugs.slice();
          }}
        >
          {selectedSlugs.map((s) => (
            <input key={s} type="hidden" name="slug" value={s} />
          ))}
          <input type="hidden" name="bucketId" value={bannedBucket.id} />
          <BulkDangerButton tone="ban" aria-describedby={countId}>
            Ban
          </BulkDangerButton>
        </form>
      ) : null}

      <form
        action={deleteAction}
        onSubmit={(e) => {
          const ok = window.confirm(
            `Delete ${count} tag${count === 1 ? "" : "s"} and strip them from all gallery items? This can't be undone.`,
          );
          if (!ok) {
            e.preventDefault();
            return;
          }
          deleteCommitRef.current = selectedSlugs.slice();
        }}
      >
        {selectedSlugs.map((s) => (
          <input key={s} type="hidden" name="slug" value={s} />
        ))}
        <BulkDangerButton tone="delete" aria-describedby={countId}>
          Delete permanently
        </BulkDangerButton>
      </form>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto rounded-md border border-bone-800 bg-transparent px-3 py-1.5 text-xs font-medium text-bone-300 transition-colors hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      >
        Clear
      </button>

      {assignState ? <StatusLine state={assignState} /> : null}
      {deleteState ? <StatusLine state={deleteState} /> : null}
    </div>
  );
}

// Pending-aware destructive button. Ban is restrained red outline;
// Delete is filled red — both readable as dangerous, but Delete reads
// louder because it's terminal whereas Ban is a bucket reassignment
// with a sweep.
function BulkDangerButton({
  children,
  tone,
  "aria-describedby": ariaDescribedby,
}: {
  children: ReactNode;
  tone: "ban" | "delete";
  "aria-describedby"?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-describedby={ariaDescribedby}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-40",
        tone === "ban" &&
          "border border-red-900/60 bg-transparent text-red-200 hover:bg-red-950/40",
        tone === "delete" &&
          "border border-red-700 bg-red-800/70 text-red-50 hover:bg-red-700",
      )}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// "Classify uncategorized" button — one Haiku call across every
// bucketId=null tag. Admin-invoked (not auto-fire at creation).

function ClassifyUncategorizedButton({ count }: { count: number }) {
  const [state, action] = useFormState(classifyUncategorizedAction, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <ClassifyButtonInner count={count} />
      {state ? <StatusLine state={state} /> : null}
    </form>
  );
}

function ClassifyButtonInner({ count }: { count: number }) {
  const { pending } = useFormStatus();
  const disabled = pending || count === 0;
  return (
    <button
      type="submit"
      disabled={disabled}
      title={
        count === 0
          ? "Nothing uncategorized"
          : `Ask Haiku to classify ${count} uncategorized tag${count === 1 ? "" : "s"}`
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-claude-500/50 bg-claude-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Classifying…" : `Classify uncategorized${count > 0 ? ` (${count})` : ""}`}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bucket editor — add + rename. Skips delete and merge (those have
// downstream Media-sweep implications worth a separate design pass).

function BucketEditor({ buckets }: { buckets: BucketOption[] }) {
  const [addState, addAction] = useFormState(addBucketAction, null);

  return (
    <details className="group rounded-2xl border border-bone-800 bg-bone-900/40 open:bg-bone-900/60">
      <summary className="flex cursor-pointer select-none items-center justify-between rounded-2xl px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.18em] text-claude-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400">
        <span>Edit buckets ({buckets.length})</span>
        <span className="text-bone-400 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="space-y-4 px-5 pb-5">
        <form action={addAction} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]">
            <label
              htmlFor="bucket-add-label"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
            >
              New bucket label
            </label>
            <input
              id="bucket-add-label"
              name="label"
              type="text"
              placeholder="e.g. vibes"
              maxLength={40}
              autoComplete="off"
              className="w-full rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            />
          </div>
          <div>
            <label
              htmlFor="bucket-add-sortorder"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
            >
              Sort order
            </label>
            <input
              id="bucket-add-sortorder"
              name="sortOrder"
              type="number"
              placeholder="auto"
              className="w-24 rounded-md border border-bone-800 bg-bone-900/60 px-2 py-1.5 text-sm text-bone-100 placeholder:text-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            />
          </div>
          <SubmitButton kind="secondary">Add bucket</SubmitButton>
          {addState ? <StatusLine state={addState} /> : null}
        </form>

        <div className="space-y-3 border-t border-bone-800 pt-3">
          <p className="text-xs text-bone-400">
            A rule makes the bucket operational — Gemini uses it and the
            classifier writes into it. No rule = loose vocabulary.
          </p>
          <ul className="space-y-4">
            {buckets.map((b) => (
              <li key={b.id}>
                <BucketEditRow bucket={b} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

function isPriorityBucket(b: BucketOption): boolean {
  return !!b.description && b.description.trim().length > 0;
}

function BucketEditRow({ bucket }: { bucket: BucketOption }) {
  const [state, action] = useFormState(updateBucketAction, null);
  const priority = isPriorityBucket(bucket);
  // Remount on either field changing server-side so the uncontrolled
  // inputs always reflect fresh defaults after a save. JSON.stringify
  // is unambiguous even if a label happens to contain the field
  // separator, which the `::` shorthand wasn't.
  const remountKey = JSON.stringify([bucket.label, bucket.description]);
  const descriptionId = `bucket-desc-${bucket.id}`;
  const helpId = `bucket-desc-help-${bucket.id}`;
  return (
    <form
      action={action}
      className={cn(
        "space-y-2 border-l-2 pl-3 transition-colors",
        priority ? "border-claude-500/60" : "border-transparent",
      )}
      aria-label={
        priority
          ? `Bucket "${bucket.label}" — priority (included in the classifier prompt)`
          : `Bucket "${bucket.label}" — secondary`
      }
      key={remountKey}
    >
      <input type="hidden" name="id" value={bucket.id} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="label"
          type="text"
          defaultValue={bucket.label}
          maxLength={40}
          className="min-w-[180px] flex-1 rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
        {priority ? (
          <span className="text-xs text-claude-300">Priority</span>
        ) : null}
        <SubmitButton kind="secondary">Save</SubmitButton>
        {state ? <StatusLine state={state} /> : null}
      </div>
      <textarea
        id={descriptionId}
        name="description"
        defaultValue={bucket.description ?? ""}
        rows={2}
        maxLength={1000}
        placeholder="Rule for what belongs here…"
        aria-describedby={helpId}
        className="w-full rounded-md border border-bone-800 bg-bone-900/60 px-3 py-2 text-sm text-bone-100 placeholder:text-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      />
      <p id={helpId} className="text-xs text-bone-500">
        Example: real named humans only — players, celebrities,
        members. Skip mascots, teams, groups.
      </p>
    </form>
  );
}
