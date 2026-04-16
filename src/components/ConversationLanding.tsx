"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type {
  ConversationCharacterDTO,
  ConversationListItem,
  CreateConversationResponse,
} from "@/lib/chat";

// Inlined user shape — keeps this client component free of any
// runtime dep on src/lib/auth (which is server-only).
type LandingUser = {
  id: string;
  displayName: string;
};

type ConversationLandingProps = {
  user: LandingUser;
  characters: readonly ConversationCharacterDTO[];
  defaultCharacterId: string;
  recentConversations: readonly ConversationListItem[];
};

const SUGGESTION_CHIPS = [
  "Write a SportsCenter intro for Mike's fantasy team",
  "Roast Joey's last draft pick",
  "Make a fake ESPN headline about trip weekend",
  "Give me a power ranking of the crew",
];

export function ConversationLanding({
  user,
  characters,
  defaultCharacterId,
  recentConversations,
}: ConversationLandingProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prefill from query params — used by the agent-handoff flow where
  // clicking "Ask Joey →" lands back here with the original prompt and
  // Joey preselected.
  const prefillContent = searchParams.get("prefill") ?? "";
  const prefillAgent = searchParams.get("agent");

  const [content, setContent] = useState(prefillContent);
  const [characterId, setCharacterId] = useState<string>(() => {
    if (prefillAgent) {
      const found = characters.find((c) => c.name === prefillAgent);
      if (found) return found.id;
    }
    return defaultCharacterId;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === characterId) ?? characters[0] ?? null,
    [characters, characterId],
  );

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, characterId }),
      });
      const data = (await res.json()) as CreateConversationResponse;
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Couldn't start the chat");
        setSubmitting(false);
        return;
      }
      // Navigate into the new thread. Don't clear `submitting` — the
      // page transition will unmount this component.
      router.push(`/chat/${data.conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col gap-6 px-4 pb-16 pt-12 md:pt-20">
      <header className="space-y-1 pl-12 md:pl-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50">
          Welcome back, {user.displayName}.
        </h1>
        <p className="text-sm text-bone-300">What do you want to make?</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <label
            htmlFor="landing-agent"
            className="text-[0.65rem] font-semibold uppercase tracking-wide text-bone-400"
          >
            Chatting with
          </label>
          <select
            id="landing-agent"
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
            disabled={submitting}
            className={cn(
              "rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-sm text-bone-100",
              "focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={`Ask ${selectedCharacter?.displayName ?? "Moises"} anything…`}
          rows={4}
          disabled={submitting}
          className={cn(
            "min-h-[7rem] w-full resize-none rounded-2xl border border-bone-700 bg-bone-950 px-4 py-3 text-sm leading-relaxed text-bone-50 placeholder-bone-400",
            "focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />

        <div className="flex items-center justify-between gap-2">
          {error ? (
            <p className="text-xs text-red-300">{error}</p>
          ) : (
            <span className="text-xs text-bone-400">
              Enter to send · Shift+Enter for newline
            </span>
          )}
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className={cn(
              "rounded-2xl bg-claude-500 px-5 py-2 text-sm font-medium text-bone-50 transition-colors",
              "hover:bg-claude-600",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
            )}
          >
            {submitting ? "Starting…" : "Send"}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={submitting}
            onClick={() => setContent(chip)}
            className={cn(
              "rounded-full border border-bone-700 bg-bone-900/80 px-3 py-1.5 text-xs text-bone-200 transition-colors",
              "hover:border-claude-500/60 hover:text-claude-100",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
            )}
          >
            {chip}
          </button>
        ))}
      </div>

      {recentConversations.length > 0 ? (
        <div className="mt-4 border-t border-bone-800 pt-6">
          <h2 className="font-display text-[0.65rem] font-semibold uppercase tracking-wide text-bone-400">
            Recent
          </h2>
          <ul className="mt-3 space-y-1">
            {recentConversations.slice(0, 6).map((c) => (
              <li key={c.id}>
                <a
                  href={`/chat/${c.id}`}
                  className="block truncate rounded-lg px-3 py-2 text-sm text-bone-200 transition-colors hover:bg-bone-800/70 hover:text-bone-50"
                >
                  <span className="font-medium">
                    {c.title ?? "Untitled chat"}
                  </span>
                  <span className="ml-2 text-xs text-bone-500">
                    with {c.character.displayName}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
