"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type {
  ConversationCharacterDTO,
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
};

const SUGGESTION_CHIPS = [
  "Write a SportsCenter intro for Mike's fantasy team",
  "Roast Joey's last draft pick",
  "Make a fake ESPN headline about trip weekend",
  "Give me a power ranking of the crew",
];

function timeBasedGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function ConversationLanding({
  user,
  characters,
  defaultCharacterId,
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

  // Greet after hydration so SSR/client times agree.
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    setGreeting(timeBasedGreeting());
  }, []);

  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === characterId) ?? characters[0] ?? null,
    [characters, characterId],
  );

  const firstName = user.displayName.split(/\s+/)[0] ?? user.displayName;

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

  const canSend = !submitting && content.trim().length > 0;

  // `pt-16` on mobile clears the fixed hamburger (`top-4`, ~40px tall) so
  // we don't need horizontal padding to dodge it. Container is `mx-auto`
  // with `max-w-2xl` — keep the hero optically centered, not shoved right.
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col justify-center gap-8 px-4 pb-12 pt-16 md:pt-20">
      {/* Hero — single load-bearing element: time-based greeting. The
          brand wordmark already lives in the sidebar; repeating it here
          would fight the input card for focus. */}
      <header className="text-center">
        <h1 className="font-display text-balance text-4xl font-medium tracking-tight text-bone-50 md:text-5xl">
          {greeting}, {firstName}
        </h1>
      </header>

      {/* Unified input card */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div
          className={cn(
            "relative flex flex-col gap-2 rounded-3xl border border-bone-700 bg-bone-900/90 px-4 pb-2 pt-3 transition-colors",
            "focus-within:border-claude-500/60 focus-within:ring-1 focus-within:ring-claude-500/30",
            submitting && "opacity-60",
          )}
        >
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
            rows={3}
            disabled={submitting}
            className={cn(
              "min-h-[4.5rem] w-full resize-none border-0 bg-transparent p-0 text-[0.95rem] leading-relaxed text-bone-50 placeholder-bone-300",
              "focus:outline-none focus:ring-0",
              "disabled:cursor-not-allowed",
            )}
            aria-label="Your message"
          />

          <div className="flex items-center justify-between gap-2">
            {/* Agent picker chip */}
            <label htmlFor="landing-agent" className="sr-only">
              Chatting with
            </label>
            <select
              id="landing-agent"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              disabled={submitting}
              className={cn(
                "rounded-full border border-bone-700 bg-bone-800/60 px-3 py-1.5 text-xs text-bone-200 transition-colors",
                "hover:border-claude-500/60 hover:text-claude-100",
                "focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500/40",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className={cn(
                // 40px hit target — iOS HIG wants 44, we give 40 because
                // the chip-row tap targets below are right there too and a
                // 44px button would dominate the card. 40 is the compromise.
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                // Ghost state when empty so we don't shout "send" before
                // there's anything to send. Rose only activates once there's
                // content to dispatch.
                canSend
                  ? "bg-claude-500 text-bone-50 hover:bg-claude-600"
                  : "bg-bone-800 text-bone-300",
                "disabled:cursor-not-allowed",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              )}
            >
              {/* Up-arrow — inline SVG, no new dep */}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-2 text-center text-xs text-red-300"
          >
            {error}
          </p>
        ) : null}
      </form>

      {/* Suggestion chips — horizontal scroll on a single line. Wrap+center
          reads as "rigid grid of options"; scroll reads as "there are more
          where these came from" and preserves Claude's one-line rhythm. */}
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
        <div className="flex w-max flex-nowrap gap-2">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={submitting}
              onClick={() => setContent(chip)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border border-bone-700 bg-bone-900/60 px-4 py-2 text-sm text-bone-200 transition-colors",
                "hover:border-claude-500/60 hover:text-claude-100",
                "disabled:cursor-not-allowed disabled:opacity-60",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              )}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
