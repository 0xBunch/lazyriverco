"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  createModelPricing,
  updateModelPricing,
  type AdminUsageState,
} from "./actions";

// Editable table of ModelPricing rows. Each row has inline edit via
// useFormState against updateModelPricing; an "Add model" form at the
// bottom wraps createModelPricing. Pending states scope to the firing
// form, so editing Sonnet's rate doesn't flash the Gemini row.
//
// Invariant surfaced via the helper text: rate edits apply to future
// calls only. Past LLMUsageEvent rows are locked to estimatedCostUsd
// computed at write time (see src/lib/usage.ts).

export type ModelPricingRow = {
  id: string;
  provider: string;
  model: string;
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  cacheReadPerMTokUsd: number | null;
  cacheWritePerMTokUsd: number | null;
  perImageUsd: number | null;
  notes: string | null;
  updatedAt: Date;
};

export function ModelPricingPanel({ rows }: { rows: ModelPricingRow[] }) {
  return (
    <section
      aria-label="Model pricing"
      className="rounded-2xl border border-bone-700 bg-bone-900"
    >
      <header className="border-b border-bone-800 px-5 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-claude-300">
          Model pricing
        </h2>
        <p className="mt-1 text-xs italic text-bone-400">
          Rate edits apply to future calls only. Past events are locked
          to the rate in effect at their time.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm italic text-bone-400">
          No pricing rows yet. Add one below.
        </p>
      ) : (
        <ul className="divide-y divide-bone-800">
          {rows.map((row) => (
            <li key={row.id}>
              <PricingRow row={row} />
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-bone-800 bg-bone-950/40 p-4">
        <AddPricingRow />
      </div>
    </section>
  );
}

function PricingRow({ row }: { row: ModelPricingRow }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-bone-50">
            {row.model}
          </p>
          <p className="text-xs text-bone-400">
            {row.provider} · in ${row.inputPerMTokUsd.toFixed(2)}/M · out $
            {row.outputPerMTokUsd.toFixed(2)}/M
            {row.cacheReadPerMTokUsd !== null
              ? ` · cache-read $${row.cacheReadPerMTokUsd.toFixed(2)}/M`
              : ""}
            {row.cacheWritePerMTokUsd !== null
              ? ` · cache-write $${row.cacheWritePerMTokUsd.toFixed(2)}/M`
              : ""}
            {row.perImageUsd !== null
              ? ` · $${row.perImageUsd.toFixed(4)}/image`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-xs font-medium text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>
      {editing ? <EditForm row={row} onDone={() => setEditing(false)} /> : null}
    </div>
  );
}

function EditForm({
  row,
  onDone,
}: {
  row: ModelPricingRow;
  onDone: () => void;
}) {
  const [state, action] = useFormState(updateModelPricing, null);
  return (
    <form
      action={action}
      className="mt-3 space-y-3 rounded-md border border-bone-800 bg-bone-950/40 p-3"
    >
      <input type="hidden" name="id" value={row.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`input-${row.id}`}
          name="inputPerMTokUsd"
          label="Input $/M tokens"
          defaultValue={row.inputPerMTokUsd.toString()}
          required
        />
        <Field
          id={`output-${row.id}`}
          name="outputPerMTokUsd"
          label="Output $/M tokens"
          defaultValue={row.outputPerMTokUsd.toString()}
          required
        />
        <Field
          id={`cread-${row.id}`}
          name="cacheReadPerMTokUsd"
          label="Cache read $/M (optional)"
          defaultValue={row.cacheReadPerMTokUsd?.toString() ?? ""}
        />
        <Field
          id={`cwrite-${row.id}`}
          name="cacheWritePerMTokUsd"
          label="Cache write $/M (optional)"
          defaultValue={row.cacheWritePerMTokUsd?.toString() ?? ""}
        />
        <Field
          id={`image-${row.id}`}
          name="perImageUsd"
          label="Per-image $ (optional)"
          defaultValue={row.perImageUsd?.toString() ?? ""}
        />
      </div>
      <div>
        <label
          htmlFor={`notes-${row.id}`}
          className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
        >
          Notes
        </label>
        <textarea
          id={`notes-${row.id}`}
          name="notes"
          rows={2}
          defaultValue={row.notes ?? ""}
          maxLength={500}
          placeholder="Source URL or note — e.g. claude.com/pricing, verified 2026-04-18"
          className="w-full rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 placeholder-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
      </div>
      <div className="flex items-center gap-2">
        <SubmitButton>Save rates</SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-bone-800 bg-transparent px-3 py-1.5 text-xs font-medium text-bone-300 transition-colors hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        >
          Cancel
        </button>
        {state ? <StatusLine state={state} /> : null}
      </div>
    </form>
  );
}

function AddPricingRow() {
  const [state, action] = useFormState(createModelPricing, null);
  return (
    <form action={action} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-bone-300">
        Add model
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="new-provider"
          name="provider"
          label="Provider"
          placeholder="anthropic / google / openai"
          required
          type="text"
        />
        <Field
          id="new-model"
          name="model"
          label="Model ID"
          placeholder="claude-opus-4-6"
          required
          type="text"
        />
        <Field
          id="new-input"
          name="inputPerMTokUsd"
          label="Input $/M tokens"
          placeholder="3.00"
          required
        />
        <Field
          id="new-output"
          name="outputPerMTokUsd"
          label="Output $/M tokens"
          placeholder="15.00"
          required
        />
        <Field
          id="new-cread"
          name="cacheReadPerMTokUsd"
          label="Cache read $/M (optional)"
          placeholder="0.30"
        />
        <Field
          id="new-cwrite"
          name="cacheWritePerMTokUsd"
          label="Cache write $/M (optional)"
          placeholder="3.75"
        />
        <Field
          id="new-image"
          name="perImageUsd"
          label="Per-image $ (optional)"
          placeholder="0.004"
        />
      </div>
      <div>
        <label
          htmlFor="new-notes"
          className="mb-1 block text-xs font-semibold uppercase tracking-wider text-bone-300"
        >
          Notes
        </label>
        <input
          id="new-notes"
          name="notes"
          type="text"
          maxLength={500}
          placeholder="Source URL or note"
          className="w-full rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 placeholder-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
      </div>
      <div className="flex items-center gap-2">
        <SubmitButton>Add model</SubmitButton>
        {state ? <StatusLine state={state} /> : null}
      </div>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  placeholder,
  required = false,
  type = "number",
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number";
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-bone-300" htmlFor={id}>
      <span className="font-semibold uppercase tracking-wider">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        min={type === "number" ? "0" : undefined}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 placeholder-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      />
    </label>
  );
}

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "rounded-md border border-claude-500/60 bg-claude-500/15 px-3 py-1.5 text-xs font-medium text-claude-100 transition-colors hover:bg-claude-500/25",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function StatusLine({ state }: { state: AdminUsageState }) {
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
