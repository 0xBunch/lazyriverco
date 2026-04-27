"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PromptSuggester } from "@/components/PromptSuggester";
import { AvatarUploader } from "@/components/AvatarUploader";
import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL,
  type AgentModelId,
} from "@/lib/agent-models";
import {
  createAgent,
  updateAgent,
  type AgentFormState,
} from "@/app/(portal)/admin/agents/personas/actions";

// Shared client-side wrapper for the create + update agent forms. Uses
// useFormState so server-side validation errors render inline ("System
// prompt too long (9123 / 16000 chars).") instead of bubbling to Next's
// anonymized digest boundary in production. Same pattern as the
// AdminLibraryTable action bar.

type Agent = {
  id: string;
  name: string;
  displayName: string;
  systemPrompt: string;
  active: boolean;
  avatarUrl: string | null;
  dialogueMode: boolean;
  model: string;
};

type Props =
  | { mode: "create" }
  | { mode: "update"; agent: Agent };

export function AgentForm(props: Props) {
  return props.mode === "create" ? (
    <CreateAgentForm />
  ) : (
    <UpdateAgentForm agent={props.agent} />
  );
}

function CreateAgentForm() {
  const [state, formAction] = useFormState<AgentFormState, FormData>(
    createAgent,
    null,
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="avatarUrl" value={avatarUrl ?? ""} />

      <AvatarUploader value={avatarUrl} onChange={setAvatarUrl} />

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

      <ModelField id="new-model" />

      <DialogueModeField id="new-dialogueMode" />

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

function UpdateAgentForm({ agent }: { agent: Agent }) {
  const [state, formAction] = useFormState<AgentFormState, FormData>(
    updateAgent,
    null,
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(agent.avatarUrl);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={agent.id} />
      <input type="hidden" name="avatarUrl" value={avatarUrl ?? ""} />

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

      <AvatarUploader value={avatarUrl} onChange={setAvatarUrl} />

      <LabeledInput
        id={`displayName-${agent.id}`}
        name="displayName"
        label="Display name"
        defaultValue={agent.displayName}
        required
      />

      <ModelField
        id={`model-${agent.id}`}
        defaultValue={agent.model}
      />

      <DialogueModeField
        id={`dialogueMode-${agent.id}`}
        defaultChecked={agent.dialogueMode}
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

function ModelField({
  id,
  defaultValue,
}: {
  id: string;
  defaultValue?: string;
}) {
  // Coerce any stale value back to the default so the select always has
  // a matching option selected on mount (otherwise React renders with
  // whatever the first option is, making "save" silently change it).
  const selected: AgentModelId =
    defaultValue &&
    AGENT_MODELS.some((m) => m.id === defaultValue)
      ? (defaultValue as AgentModelId)
      : DEFAULT_AGENT_MODEL;
  const selectedMeta =
    AGENT_MODELS.find((m) => m.id === selected) ?? AGENT_MODELS[1];

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-bone-200">
        Model
      </label>
      <select
        id={id}
        name="model"
        defaultValue={selected}
        className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
      >
        {AGENT_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="text-[0.7rem] text-bone-400">{selectedMeta.description}</p>
    </div>
  );
}

function DialogueModeField({
  id,
  defaultChecked = false,
}: {
  id: string;
  defaultChecked?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 rounded-lg border border-bone-700 bg-bone-950/60 p-3"
    >
      <input
        id={id}
        name="dialogueMode"
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-bone-100">
          Dialogue mode
        </span>
        <span className="mt-0.5 block text-xs text-bone-300">
          Lift the 1-3 sentence cap. Agent replies at the depth the question
          warrants and MAY end with 2-3 clickable follow-up suggestions when
          the topic has natural branches. Self-contained answers still stay
          short — it&rsquo;s the model&rsquo;s judgment, not a forced
          elaboration.
        </span>
      </span>
    </label>
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
