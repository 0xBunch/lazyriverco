"use client";

import { useFormState, useFormStatus } from "react-dom";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PromptSuggester } from "@/components/PromptSuggester";
import {
  createAgent,
  updateAgent,
  type AgentFormState,
} from "@/app/(portal)/admin/agents/actions";

// Shared client-side wrapper for the create + update agent forms. Uses
// useFormState so server-side validation errors render inline ("System
// prompt too long (9123 / 16000 chars).") instead of bubbling to Next's
// anonymized digest boundary in production. Same pattern as the
// AdminGalleryTable action bar.

type Agent = {
  id: string;
  name: string;
  displayName: string;
  systemPrompt: string;
  active: boolean;
};

type Props =
  | { mode: "create" }
  | { mode: "update"; agent: Agent };

export function AgentForm(props: Props) {
  const action = props.mode === "create" ? createAgent : updateAgent;
  const [state, formAction] = useFormState<AgentFormState, FormData>(
    action,
    null,
  );

  if (props.mode === "create") {
    return (
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledInput
            id="new-name"
            name="name"
            label="Slug (@handle)"
            placeholder="e.g. barfdog"
            required
          />
          <LabeledInput
            id="new-displayName"
            name="displayName"
            label="Display name"
            placeholder='e.g. Joey "Barfdog" Freedman'
            required
          />
        </div>

        <PromptField
          id="new-systemPrompt"
          characterName="New agent"
          rows={8}
        />

        <FooterRow hasActive>
          <SubmitButton>Create Agent</SubmitButton>
        </FooterRow>

        <StateLine state={state} />
      </form>
    );
  }

  const agent = props.agent;
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={agent.id} />

      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg font-semibold text-bone-50">
            {agent.displayName}
          </p>
          <p className="text-xs uppercase tracking-wide text-bone-300">
            @{agent.name}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-bone-300">
          <input
            type="checkbox"
            name="active"
            defaultChecked={agent.active}
            className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500"
          />
          Active
        </label>
      </header>

      <LabeledInput
        id={`displayName-${agent.id}`}
        name="displayName"
        label="Display name"
        defaultValue={agent.displayName}
        required
      />

      <PromptField
        id={`systemPrompt-${agent.id}`}
        characterName={agent.displayName}
        defaultValue={agent.systemPrompt}
        rows={16}
      />

      <FooterRow>
        <SubmitButton>Save {agent.displayName}</SubmitButton>
      </FooterRow>

      <StateLine state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------

function LabeledInput({
  id,
  name,
  label,
  placeholder,
  defaultValue,
  required,
}: {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-bone-200">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-400 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
      />
    </div>
  );
}

function PromptField({
  id,
  characterName,
  defaultValue,
  rows,
}: {
  id: string;
  characterName: string;
  defaultValue?: string;
  rows: number;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="text-xs font-medium text-bone-200"
      >
        System prompt (persona bible)
      </label>
      <textarea
        id={id}
        name="systemPrompt"
        defaultValue={defaultValue}
        rows={rows}
        required
        placeholder="Write the character's persona — who they are, how they talk, what topics they're experts on, what makes them funny."
        className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-xs leading-relaxed text-bone-50 placeholder-bone-400 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
      />
      <div className="flex items-center justify-between">
        {defaultValue ? (
          <p className="text-[0.7rem] text-bone-300">
            {defaultValue.length} chars
          </p>
        ) : (
          <span />
        )}
        <PromptSuggester
          textareaId={id}
          extraPayload={{ characterName }}
        />
      </div>
    </div>
  );
}

function FooterRow({
  hasActive,
  children,
}: {
  hasActive?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      {hasActive ? (
        <label className="flex items-center gap-2 text-xs text-bone-300">
          <input
            type="checkbox"
            name="active"
            defaultChecked
            className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500"
          />
          Active
        </label>
      ) : (
        <span />
      )}
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function StateLine({ state }: { state: AgentFormState }) {
  if (!state) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "text-sm",
        state.ok ? "text-emerald-300" : "text-red-300",
      )}
    >
      {state.ok ? state.message : state.error}
    </p>
  );
}
