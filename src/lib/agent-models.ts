// Per-agent model allowlist — shared between the server-side Anthropic
// SDK layer (src/lib/anthropic.ts) and the client-side admin UI
// (src/components/AgentForm.tsx). Kept free of `server-only` imports so
// the same list powers the dropdown the admin sees.
//
// Each Character row stores a `model` string; at call time the stream
// route runs it through `resolveAgentModel` (defined in anthropic.ts)
// which narrows an arbitrary string back to CHAT_MODEL when it doesn't
// match an entry here — defense against a stale row after an allowlist
// prune.

export const AGENT_MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    description: "Fastest and cheapest — good for simpler personas.",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    description: "Balanced — the default.",
  },
  {
    id: "claude-opus-4-7",
    label: "Opus 4.7",
    description: "Most capable, highest cost — use where smart matters.",
  },
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];

export const DEFAULT_AGENT_MODEL: AgentModelId = "claude-sonnet-4-6";

export function isValidAgentModel(id: string): id is AgentModelId {
  return AGENT_MODELS.some((m) => m.id === id);
}
