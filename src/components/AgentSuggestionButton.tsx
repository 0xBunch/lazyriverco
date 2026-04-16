"use client";

import { useRouter } from "next/navigation";

type AgentSuggestionButtonProps = {
  /** Active character slug (already allow-list validated server-side). */
  characterName: string;
  /** Optional pretty name; falls back to the slug. */
  characterDisplayName?: string;
  /** Short reason string, already sanitized + capped server-side by
   *  parseSentinel in src/lib/agent-sentinels.ts. Rendered as a React
   *  text child — never spliced into an href or innerHTML. */
  reason: string;
  /** The user's original prompt to pre-fill in the new chat composer,
   *  so the handoff starts from the same question as context. */
  prefillContent?: string;
};

export function AgentSuggestionButton({
  characterName,
  characterDisplayName,
  reason,
  prefillContent,
}: AgentSuggestionButtonProps) {
  const router = useRouter();
  const label = characterDisplayName ?? characterName;

  function handleClick() {
    const params = new URLSearchParams({ agent: characterName });
    if (prefillContent) params.set("prefill", prefillContent);
    // router.push takes a typed path — the query params are URL-encoded
    // by URLSearchParams, so there's no injection surface here.
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-full border border-bone-700 bg-bone-900/80 px-3 py-1 text-xs font-medium text-bone-200 transition-colors hover:border-claude-500/60 hover:text-claude-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
      >
        Ask {label} →
      </button>
      {reason ? (
        <span className="text-xs italic text-bone-400">{reason}</span>
      ) : null}
    </div>
  );
}
