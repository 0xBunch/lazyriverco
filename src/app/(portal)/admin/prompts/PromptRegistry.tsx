"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  createGroupAction,
  createItemAction,
  deleteGroupAction,
  deleteItemAction,
  reorderGroupAction,
  reorderItemAction,
  updateGroupAction,
  updateItemAction,
  type AdminPromptsState,
} from "./actions";

// /admin/prompts registry view. One card per PromptGroup; each card
// lists its PromptSuggestion items with inline edit. Every write goes
// through a server action so pending states scope to the firing form.

export type PromptItemRow = {
  id: string;
  label: string;
  prompt: string;
  sortOrder: number;
  isActive: boolean;
};

export type PromptGroupRow = {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  items: PromptItemRow[];
};

export function PromptRegistry({ rows }: { rows: PromptGroupRow[] }) {
  return (
    <div className="space-y-5">
      <AddGroupBar />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-bone-700 bg-bone-950/40 p-6 text-sm text-bone-400">
          No groups yet. Add one above — e.g. &ldquo;Write&rdquo;,
          &ldquo;Roast&rdquo;, &ldquo;Learn&rdquo; — then fill it with
          suggestions.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((g, i) => (
            <li key={g.id}>
              <GroupCard
                group={g}
                isFirst={i === 0}
                isLast={i === rows.length - 1}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddGroupBar() {
  const [state, action] = useFormState(createGroupAction, null);
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-bone-800 bg-bone-950/60 p-4"
    >
      <label htmlFor="new-group-label" className="sr-only">
        New group label
      </label>
      <input
        id="new-group-label"
        name="label"
        type="text"
        required
        maxLength={40}
        placeholder="New group (e.g. Write)"
        className="min-w-0 flex-1 rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 placeholder-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      />
      <SubmitButton kind="primary">Add group</SubmitButton>
      {state ? <StatusLine state={state} /> : null}
    </form>
  );
}

function GroupCard({
  group,
  isFirst,
  isLast,
}: {
  group: PromptGroupRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <section
      aria-label={`Group: ${group.label}`}
      className={cn(
        "rounded-2xl border border-bone-700 bg-bone-900 p-5",
        !group.isActive && "opacity-70",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-bone-800 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-bone-50">
            {group.label}
          </h2>
          {!group.isActive ? (
            <span className="rounded-full border border-bone-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-bone-400">
              Hidden
            </span>
          ) : null}
          <span className="text-xs text-bone-400">
            {group.items.length} item{group.items.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReorderButton id={group.id} direction="up" kind="group" disabled={isFirst} />
          <ReorderButton id={group.id} direction="down" kind="group" disabled={isLast} />
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-xs font-medium text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          >
            {editing ? "Close" : "Edit"}
          </button>
          <DeleteGroupButton group={group} />
        </div>
      </header>

      {editing ? <EditGroupForm group={group} /> : null}

      <div className="mt-4 space-y-2">
        {group.items.length === 0 ? (
          <p className="text-xs italic text-bone-400">
            No items yet — add one below.
          </p>
        ) : (
          <ul className="divide-y divide-bone-800 rounded-md border border-bone-800">
            {group.items.map((item, i) => (
              <li key={item.id}>
                <ItemRow
                  item={item}
                  isFirst={i === 0}
                  isLast={i === group.items.length - 1}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddItemForm groupId={group.id} />
    </section>
  );
}

function ReorderButton({
  id,
  direction,
  kind,
  disabled,
}: {
  id: string;
  direction: "up" | "down";
  kind: "group" | "item";
  disabled: boolean;
}) {
  const action = kind === "group" ? reorderGroupAction : reorderItemAction;
  const [, formAction] = useFormState(action, null);
  const fieldName = kind === "group" ? "groupId" : "itemId";
  const symbol = direction === "up" ? "↑" : "↓";
  return (
    <form action={formAction}>
      <input type="hidden" name={fieldName} value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Move ${direction}`}
        className="rounded-md border border-bone-800 bg-bone-900/60 px-2 py-1 text-xs text-bone-300 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {symbol}
      </button>
    </form>
  );
}

function DeleteGroupButton({ group }: { group: PromptGroupRow }) {
  const [, action] = useFormState(deleteGroupAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const n = group.items.length;
        const msg =
          n > 0
            ? `Delete "${group.label}" and its ${n} item${n === 1 ? "" : "s"}? Can't be undone.`
            : `Delete "${group.label}"?`;
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="groupId" value={group.id} />
      <DeleteSubmitButton label="Delete group" />
    </form>
  );
}

function EditGroupForm({ group }: { group: PromptGroupRow }) {
  const [state, action] = useFormState(updateGroupAction, null);
  return (
    <form
      action={action}
      className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-bone-800 bg-bone-950/40 p-3"
    >
      <input type="hidden" name="groupId" value={group.id} />
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-bone-300">
        Label
        <input
          name="label"
          type="text"
          required
          maxLength={40}
          defaultValue={group.label}
          className="rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-bone-300">
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={group.isActive}
          className="h-4 w-4 rounded border-bone-700 bg-bone-950 text-claude-500 focus-visible:ring-2 focus-visible:ring-claude-400"
        />
        Active (shown on homepage)
      </label>
      <SubmitButton kind="primary">Save</SubmitButton>
      {state ? <StatusLine state={state} /> : null}
    </form>
  );
}

function ItemRow({
  item,
  isFirst,
  isLast,
}: {
  item: PromptItemRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      className={cn(
        "p-3",
        !item.isActive && "bg-bone-950/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-bone-100">
              {item.label}
            </span>
            {!item.isActive ? (
              <span className="rounded-full border border-bone-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-bone-400">
                Hidden
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-bone-400" title={item.prompt}>
            {item.prompt}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ReorderButton id={item.id} direction="up" kind="item" disabled={isFirst} />
          <ReorderButton id={item.id} direction="down" kind="item" disabled={isLast} />
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-bone-800 bg-bone-900/60 px-2.5 py-1 text-xs text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          >
            {editing ? "Close" : "Edit"}
          </button>
          <DeleteItemButton item={item} />
        </div>
      </div>

      {editing ? <EditItemForm item={item} /> : null}
    </div>
  );
}

function EditItemForm({ item }: { item: PromptItemRow }) {
  const [state, action] = useFormState(updateItemAction, null);
  return (
    <form
      action={action}
      className="mt-3 space-y-2 rounded-md border border-bone-800 bg-bone-950/40 p-3"
    >
      <input type="hidden" name="itemId" value={item.id} />
      <label className="block text-xs text-bone-300">
        Label (shown in dropdown)
        <input
          name="label"
          type="text"
          required
          maxLength={60}
          defaultValue={item.label}
          className="mt-1 w-full rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
      </label>
      <label className="block text-xs text-bone-300">
        Prompt (pasted into input on click)
        <textarea
          name="prompt"
          required
          maxLength={2000}
          rows={3}
          defaultValue={item.prompt}
          className="mt-1 w-full rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-bone-300">
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={item.isActive}
          className="h-4 w-4 rounded border-bone-700 bg-bone-950 text-claude-500 focus-visible:ring-2 focus-visible:ring-claude-400"
        />
        Active (visible in dropdown)
      </label>
      <div className="flex items-center gap-2">
        <SubmitButton kind="primary">Save</SubmitButton>
        {state ? <StatusLine state={state} /> : null}
      </div>
    </form>
  );
}

function DeleteItemButton({ item }: { item: PromptItemRow }) {
  const [, action] = useFormState(deleteItemAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${item.label}"?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="itemId" value={item.id} />
      <DeleteSubmitButton label="Delete" compact />
    </form>
  );
}

function AddItemForm({ groupId }: { groupId: string }) {
  const [state, action] = useFormState(createItemAction, null);
  return (
    <form
      action={action}
      className="mt-4 space-y-2 rounded-md border border-dashed border-bone-800 bg-bone-950/30 p-3"
    >
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-bone-300">
          New item label
          <input
            name="label"
            type="text"
            required
            maxLength={60}
            placeholder="e.g. SportsCenter intro"
            className="rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 placeholder-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          />
        </label>
        <SubmitButton kind="secondary">Add item</SubmitButton>
        {state ? <StatusLine state={state} /> : null}
      </div>
      <label className="block text-xs text-bone-300">
        Prompt text (pasted into input on click)
        <textarea
          name="prompt"
          required
          maxLength={2000}
          rows={2}
          placeholder="e.g. Write a SportsCenter intro for Mike's fantasy team"
          className="mt-1 w-full rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 placeholder-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
      </label>
    </form>
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

function DeleteSubmitButton({
  label,
  compact,
}: {
  label: string;
  compact?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "rounded-md border border-red-900/60 bg-red-950/30 font-medium text-red-200 transition-colors hover:bg-red-900/40",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-40",
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs",
      )}
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}

function StatusLine({ state }: { state: AdminPromptsState }) {
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
