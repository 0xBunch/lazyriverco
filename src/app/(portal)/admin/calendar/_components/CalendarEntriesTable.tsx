"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SaveButton } from "@/components/SaveButton";
import {
  bulkDeleteCalendarEntriesAction,
  bulkTagCalendarEntriesAction,
  deleteCalendarEntry,
  updateCalendarEntry,
  type AdminCalendarState,
} from "../actions";
import { AddDateDialog } from "./AddDateDialog";

// Serializable shape the server bucket pass feeds us. Keep it flat — raw
// Prisma objects carry non-serializable dates we'd only re-stringify on
// the client anyway.
export type CalendarEntryRow = {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd of the stored date (for annuals, the original year). */
  dateIso: string;
  /**
   * ISO yyyy-mm-dd of the *next* occurrence — same as dateIso for one-time
   * entries, computed server-side for annuals (this-year if future, else
   * next-year). Used for display + sort; dateIso is what the form edits.
   */
  effectiveDateIso: string;
  recurrence: "none" | "annual";
  time: string | null;
  tags: string[];
  description: string | null;
  hasBody: boolean;
  hasVideo: boolean;
  hasMedia: boolean;
};

export type CalendarGroups = {
  upcoming: CalendarEntryRow[];
  later: CalendarEntryRow[];
  past: CalendarEntryRow[];
  older: CalendarEntryRow[];
};

type Props = {
  groups: CalendarGroups;
  totals: {
    total: number;
    upcoming: number;
    recurring: number;
  };
};

// ---------------------------------------------------------------------------

export function CalendarEntriesTable({ groups, totals }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [showOlder, setShowOlder] = useState(false);

  const filterLc = filter.trim().toLowerCase();

  const filtered = useMemo<CalendarGroups>(() => {
    if (!filterLc) return groups;
    const match = (e: CalendarEntryRow) =>
      e.title.toLowerCase().includes(filterLc) ||
      e.tags.some((t) => t.toLowerCase().includes(filterLc));
    return {
      upcoming: groups.upcoming.filter(match),
      later: groups.later.filter(match),
      past: groups.past.filter(match),
      older: groups.older.filter(match),
    };
  }, [groups, filterLc]);

  const allVisibleIds = useMemo(
    () => [
      ...filtered.upcoming,
      ...filtered.later,
      ...filtered.past,
      ...(showOlder ? filtered.older : []),
    ].map((e) => e.id),
    [filtered, showOlder],
  );

  const allSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allVisibleIds));
  };

  const clearSelection = () => setSelected(new Set());

  return (
    <div className="space-y-5">
      <TopBar
        totals={totals}
        filter={filter}
        onFilter={setFilter}
        onAdd={() => setAddOpen(true)}
      />

      {someSelected ? (
        <BulkActionBar selected={selected} onClear={clearSelection} />
      ) : null}

      {totals.total === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="space-y-6">
          <Group
            title="Upcoming"
            hint="Next 30 days"
            entries={filtered.upcoming}
            defaultOpen
            forceOpen={filterLc.length > 0 && filtered.upcoming.length > 0}
            allSelected={allSelected}
            someSelected={someSelected}
            onToggleAll={toggleAll}
            selected={selected}
            onToggle={toggle}
            expandedId={expandedId}
            onExpandChange={setExpandedId}
          />
          <Group
            title="Later"
            hint="Beyond 30 days — including annuals' next occurrence"
            entries={filtered.later}
            defaultOpen
            forceOpen={filterLc.length > 0 && filtered.later.length > 0}
            selected={selected}
            onToggle={toggle}
            expandedId={expandedId}
            onExpandChange={setExpandedId}
          />
          <Group
            title="Recent"
            hint="Past 90 days"
            entries={filtered.past}
            defaultOpen={false}
            forceOpen={filterLc.length > 0 && filtered.past.length > 0}
            selected={selected}
            onToggle={toggle}
            expandedId={expandedId}
            onExpandChange={setExpandedId}
          />
          {filtered.older.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowOlder((v) => !v)}
                className="text-xs font-semibold uppercase tracking-[0.15em] text-bone-300 transition-colors hover:text-bone-100 focus:outline-none focus-visible:text-bone-100 motion-reduce:transition-none"
              >
                {showOlder ? "– Hide" : "+ Show"} older entries ({filtered.older.length})
              </button>
              {showOlder ? (
                <div className="mt-3">
                  <Group
                    title="Older"
                    hint="More than 90 days past"
                    entries={filtered.older}
                    defaultOpen
                    selected={selected}
                    onToggle={toggle}
                    expandedId={expandedId}
                    onExpandChange={setExpandedId}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <AddDateDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar: stats + add/import buttons + filter input

function TopBar({
  totals,
  filter,
  onFilter,
  onAdd,
}: {
  totals: Props["totals"];
  filter: string;
  onFilter: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-bone-800 bg-bone-900/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <dl className="flex items-center gap-4 text-xs text-bone-300">
        <Stat label={totals.total === 1 ? "date" : "dates"} value={totals.total} />
        <span aria-hidden className="h-6 w-px bg-bone-700" />
        <Stat label="upcoming" value={totals.upcoming} />
        <span aria-hidden className="h-6 w-px bg-bone-700" />
        <Stat label="recurring" value={totals.recurring} />
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="calendar-filter">
          Filter dates
        </label>
        <input
          id="calendar-filter"
          type="search"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="Filter by title or tag…"
          className="w-full min-w-[200px] rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 sm:w-56"
        />
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 motion-reduce:transition-none"
        >
          + Add date
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="font-semibold tabular-nums text-bone-100">{value}</dd>
      <span className="text-bone-300">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group: collapsible section wrapping a list of rows

function Group({
  title,
  hint,
  entries,
  defaultOpen,
  forceOpen,
  allSelected,
  someSelected,
  onToggleAll,
  selected,
  onToggle,
  expandedId,
  onExpandChange,
}: {
  title: string;
  hint: string;
  entries: CalendarEntryRow[];
  defaultOpen: boolean;
  forceOpen?: boolean;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleAll?: () => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  expandedId: string | null;
  onExpandChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const effectiveOpen = forceOpen ? true : open;

  if (entries.length === 0) return null;

  return (
    <section>
      <header className="mb-2 flex items-center justify-between gap-3">
        <h2 className="m-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={effectiveOpen}
            className="flex items-center gap-2 text-left focus:outline-none focus-visible:text-bone-50"
          >
            <span
              aria-hidden
              className={cn(
                "inline-block text-[0.65rem] text-bone-300 transition-transform motion-reduce:transition-none",
                effectiveOpen && "rotate-90",
              )}
            >
              ▶
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-claude-300">
              {title}
            </span>
            <span className="text-xs font-normal normal-case tracking-normal text-bone-300">
              ({entries.length}) · {hint}
            </span>
          </button>
        </h2>
        {onToggleAll && effectiveOpen ? (
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-bone-300 hover:text-bone-100">
            <input
              type="checkbox"
              checked={!!allSelected}
              ref={(el) => {
                if (el) el.indeterminate = !!someSelected && !allSelected;
              }}
              onChange={onToggleAll}
              aria-label={allSelected ? "Deselect all visible" : "Select all visible"}
              className="h-3.5 w-3.5 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-400"
            />
            Select all visible
          </label>
        ) : null}
      </header>
      {effectiveOpen ? (
        <ul className="divide-y divide-bone-800/70 rounded-xl border border-bone-800 bg-bone-900/40">
          {entries.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              selected={selected.has(entry.id)}
              onToggle={() => onToggle(entry.id)}
              expanded={expandedId === entry.id}
              onExpandChange={(open) =>
                onExpandChange(open ? entry.id : null)
              }
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row: one entry. Collapsed = summary line; expanded = quick-edit form.

function Row({
  entry,
  selected,
  onToggle,
  expanded,
  onExpandChange,
}: {
  entry: CalendarEntryRow;
  selected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onExpandChange: (open: boolean) => void;
}) {
  return (
    <li
      className={cn(
        "transition-colors",
        selected && "bg-claude-500/5",
        expanded && "bg-bone-900/60",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${entry.title}`}
          className="h-4 w-4 shrink-0 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-400"
        />
        <button
          type="button"
          onClick={() => onExpandChange(!expanded)}
          aria-expanded={expanded}
          aria-controls={`entry-edit-${entry.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:text-bone-50"
        >
          <DateLabel iso={entry.effectiveDateIso} time={entry.time} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-bone-100">
            {entry.title}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.recurrence === "annual" ? (
              <span className="rounded-full bg-claude-500/15 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-claude-200">
                annual
              </span>
            ) : null}
            {entry.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-bone-800/70 px-2 py-0.5 text-[0.6rem] font-medium text-bone-300"
              >
                {tag}
              </span>
            ))}
            {entry.tags.length > 3 ? (
              <span className="text-[0.6rem] text-bone-300">
                +{entry.tags.length - 3}
              </span>
            ) : null}
          </div>
          <RichnessPips entry={entry} />
        </button>
        <Link
          href={`/admin/calendar/${entry.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex min-h-[2rem] shrink-0 items-center rounded-md px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-bone-300 transition-colors hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 motion-reduce:transition-none"
        >
          Details →
        </Link>
      </div>

      {expanded ? (
        <div id={`entry-edit-${entry.id}`} className="px-3 pb-3">
          <QuickEditForm entry={entry} onDone={() => onExpandChange(false)} />
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Date display: "Jun 2" when this/next year, "Jun 2 '28" further out.
// Time appended as a second line on wide screens, inline on narrow.

function DateLabel({ iso, time }: { iso: string; time: string | null }) {
  const d = parseIsoDate(iso);
  const today = new Date();
  const sameYear = d.getUTCFullYear() === today.getUTCFullYear();
  const monthDay = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const label = sameYear
    ? monthDay
    : `${monthDay} '${String(d.getUTCFullYear() % 100).padStart(2, "0")}`;
  return (
    <span className="w-[5.5rem] shrink-0 font-mono text-xs tabular-nums text-bone-200">
      {label}
      {time ? (
        <span className="ml-1 text-bone-300">· {time}</span>
      ) : null}
    </span>
  );
}

function RichnessPips({ entry }: { entry: CalendarEntryRow }) {
  const pips: { key: string; letter: string; label: string }[] = [];
  if (entry.hasBody) pips.push({ key: "body", letter: "B", label: "Has body" });
  if (entry.hasVideo)
    pips.push({ key: "video", letter: "V", label: "Has video" });
  if (entry.hasMedia)
    pips.push({ key: "media", letter: "P", label: "Has photos" });
  if (pips.length === 0) return null;
  // Matches the tag pill treatment (same rounded-full + font sizing) so the
  // vocabulary stays consistent — tags and richness read as "metadata chips"
  // with identical weight, distinguishable only by what each is labeled.
  return (
    <span className="ml-1 flex shrink-0 items-center gap-1">
      {pips.map((p) => (
        <span
          key={p.key}
          aria-label={p.label}
          title={p.label}
          className="rounded-full bg-bone-800/70 px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-wider text-bone-300"
        >
          {p.letter}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Quick-edit form (inline, replaces the always-visible card edit)

function QuickEditForm({
  entry,
  onDone,
}: {
  entry: CalendarEntryRow;
  onDone: () => void;
}) {
  return (
    <form
      action={async (fd: FormData) => {
        await updateCalendarEntry(fd);
        onDone();
      }}
      className="space-y-3 rounded-lg border border-bone-800 bg-bone-950/60 p-3"
    >
      <input type="hidden" name="id" value={entry.id} />

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
        <Field label="Title">
          <input
            name="title"
            defaultValue={entry.title}
            required
            className={INPUT}
          />
        </Field>
        <Field label="Date">
          <input
            name="date"
            type="date"
            defaultValue={entry.dateIso}
            required
            className={INPUT}
          />
        </Field>
        <Field label="Recurrence">
          <select name="recurrence" defaultValue={entry.recurrence} className={INPUT}>
            <option value="none">One-time</option>
            <option value="annual">Annual</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Time">
          <input
            name="time"
            type="text"
            defaultValue={entry.time ?? ""}
            placeholder="7:00 PM"
            className={INPUT}
          />
        </Field>
        <Field label="Tags">
          <input
            name="tags"
            type="text"
            defaultValue={entry.tags.join(", ")}
            placeholder="comma, separated"
            className={INPUT}
          />
        </Field>
      </div>

      <Field label="Description">
        <input
          name="description"
          type="text"
          defaultValue={entry.description ?? ""}
          placeholder="Short summary (shown in agent context)"
          className={INPUT}
        />
      </Field>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3 text-[0.65rem] uppercase tracking-wider">
          <Link
            href={`/admin/calendar/${entry.id}`}
            className="font-semibold text-claude-300 hover:text-claude-200"
          >
            Open full details →
          </Link>
          {entry.hasBody || entry.hasVideo || entry.hasMedia ? (
            <span className="text-bone-300">
              body/video/photos edited there
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-bone-800 px-3 py-1.5 text-xs font-medium text-bone-300 transition-colors hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            formAction={deleteCalendarEntry}
            className="rounded-lg border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-500/60 hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            onClick={(e) => {
              if (!confirm(`Delete "${entry.title}"?`)) e.preventDefault();
            }}
          >
            Delete
          </button>
          <SaveButton label="Save" />
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-bone-300">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Bulk action bar (shown when ≥1 row is selected)

function BulkActionBar({
  selected,
  onClear,
}: {
  selected: Set<string>;
  onClear: () => void;
}) {
  const ids = Array.from(selected);
  const disabled = ids.length === 0;
  const [deleteState, deleteAction] = useFormState(
    bulkDeleteCalendarEntriesAction,
    null,
  );
  const [tagState, tagAction] = useFormState(
    bulkTagCalendarEntriesAction,
    null,
  );

  const latest = pickLatest([deleteState, tagState]);

  return (
    <div className="sticky top-4 z-10 space-y-3 rounded-xl border border-bone-800 bg-bone-900/85 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-bone-200">
          {ids.length} selected
        </span>

        <HiddenIds ids={ids} formId="cal-bulk-delete" />
        <HiddenIds ids={ids} formId="cal-bulk-tag" />

        <form id="cal-bulk-delete" action={deleteAction} className="contents">
          <DangerButton disabled={disabled}>Delete</DangerButton>
        </form>

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-bone-300 transition-colors hover:text-bone-100 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 motion-reduce:transition-none"
        >
          Clear selection
        </button>
      </div>

      <form
        id="cal-bulk-tag"
        action={tagAction}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor="cal-bulk-tag-input" className="sr-only">
          Tag to add or remove
        </label>
        <input
          id="cal-bulk-tag-input"
          name="tag"
          type="text"
          placeholder="tag-name"
          maxLength={40}
          className="min-w-[180px] flex-1 rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
        <SecondaryButton
          disabled={disabled}
          type="submit"
          name="mode"
          value="add"
        >
          + Add tag
        </SecondaryButton>
        <SecondaryButton
          disabled={disabled}
          type="submit"
          name="mode"
          value="remove"
        >
          − Remove tag
        </SecondaryButton>
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

function HiddenIds({ ids, formId }: { ids: string[]; formId: string }) {
  return (
    <>
      {ids.map((id) => (
        <input
          key={`${formId}-${id}`}
          type="hidden"
          name="entryId"
          value={id}
          form={formId}
        />
      ))}
    </>
  );
}

function DangerButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      onClick={(e) => {
        if (!confirm("Delete all selected dates?")) e.preventDefault();
      }}
      className="rounded-md border border-red-800 bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled,
  ...rest
}: {
  children: ReactNode;
  disabled: boolean;
  type: "submit";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      disabled={disabled || pending}
      className="rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-xs font-medium text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function pickLatest(states: (AdminCalendarState | null)[]): AdminCalendarState {
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i]) return states[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Empty state

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-bone-800 bg-bone-900/30 p-10 text-center">
      <p className="font-display text-lg text-bone-200">No dates yet.</p>
      <p className="mt-1 text-sm text-bone-300">
        Add birthdays, trips, games — anything you want the agents to know about.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      >
        + Add your first date
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers

function parseIsoDate(iso: string): Date {
  // Treat the ISO yyyy-mm-dd as a UTC calendar date — matches how the
  // server stored it (Prisma @db.Date has no TZ) and avoids the browser
  // silently shifting "Jun 2" into "Jun 1" in negative-offset locales.
  const [y, m, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

const INPUT =
  "w-full rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
