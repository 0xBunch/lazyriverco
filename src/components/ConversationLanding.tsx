"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type {
  ConversationCharacterDTO,
  CreateConversationResponse,
  PromptGroupDTO,
} from "@/lib/chat";
import { PromptGroupBar } from "@/components/PromptGroupBar";

// Inlined user shape — keeps this client component free of any
// runtime dep on src/lib/auth (which is server-only).
type LandingUser = {
  id: string;
  displayName: string;
};

type ConversationLandingProps = {
  user: LandingUser;
  characters: readonly ConversationCharacterDTO[];
  /// Pre-selected character on first paint. Null in the (theoretical)
  /// case of an empty roster; falls back to the first character in the
  /// list when present.
  defaultCharacterId: string | null;
  promptGroups: readonly PromptGroupDTO[];
};

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
  promptGroups,
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
    return defaultCharacterId ?? characters[0]?.id ?? "";
  });
  // Image-generation mode: when on, the user's first message becomes a
  // txt2img prompt instead of a chat turn. We still create a real
  // conversation (attached to the selected agent) so the image has a home;
  // ConversationView reads `?image=1` on the chat route to pick up the flag
  // when it fires its first reply.
  const [imageMode, setImageMode] = useState(false);
  // NSFW sub-mode. Only meaningful when imageMode is true; routes the
  // generation to a community SDXL fine-tune with the safety checker
  // disabled. Turning imageMode off auto-resets this so the flag can't
  // silently persist into a Claude turn.
  const [nsfwMode, setNsfwMode] = useState(false);
  useEffect(() => {
    if (!imageMode && nsfwMode) setNsfwMode(false);
  }, [imageMode, nsfwMode]);
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
      // Navigate into the new thread. When image mode is on, tack on
      // `?image=1` (plus `&nsfw=1` if NSFW is also on) so
      // ConversationView fires its first reply as an image generation
      // instead of a Claude turn. Don't clear `submitting` — the page
      // transition will unmount this component.
      const query = imageMode
        ? nsfwMode
          ? "?image=1&nsfw=1"
          : "?image=1"
        : "";
      router.push(`/chat/${data.conversation.id}${query}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  const canSend = !submitting && content.trim().length > 0;

  // Anchor content from the top (not `justify-center`) so opening a
  // prompt-group panel grows downward into empty space below the chips
  // instead of re-centering and shoving the greeting + input upward.
  // `pt-[20dvh]` keeps the greeting roughly where it used to sit at
  // rest under the old centered layout; `pt-16`-worth of that budget
  // also clears the fixed hamburger (`top-4`, ~40px tall).
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-8 px-4 pb-12 pt-[20dvh] md:pt-[22dvh]">
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
            placeholder={
              imageMode
                ? "Describe an image…"
                : `Ask ${selectedCharacter?.displayName ?? "Moises"} anything…`
            }
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

            {/* Image-generation toggle — pill button matching the agent
                chip on the left. When on, the first reply is a txt2img
                result instead of Claude prose. Stays visible whether
                it's on or off so the mode is discoverable. */}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImageMode((v) => !v)}
                disabled={submitting}
                aria-label={
                  imageMode
                    ? "Turn off image generation"
                    : "Turn on image generation"
                }
                aria-pressed={imageMode}
                title={
                  imageMode
                    ? "Next message will generate an image"
                    : "Generate image mode"
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  imageMode
                    ? "border-claude-500/60 bg-claude-500/15 text-claude-200 hover:bg-claude-500/25"
                    : "border-bone-700 bg-bone-800/60 text-bone-300 hover:border-claude-500/60 hover:text-claude-100",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Image</span>
              </button>

              {/* NSFW sub-toggle. Dimmed + non-interactive when image
                  mode is off; clicking it auto-flips image mode on so
                  the common "I want adult output" click does the right
                  thing without a two-step. */}
              <button
                type="button"
                onClick={() => {
                  if (!imageMode) setImageMode(true);
                  setNsfwMode((v) => !v);
                }}
                disabled={submitting}
                aria-label={
                  nsfwMode
                    ? "Turn off NSFW image mode"
                    : "Turn on NSFW image mode"
                }
                aria-pressed={nsfwMode}
                title={
                  imageMode
                    ? nsfwMode
                      ? "NSFW model (community SDXL, safety checker off)"
                      : "Switch to NSFW model"
                    : "NSFW image mode (turns on Image too)"
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  nsfwMode
                    ? "border-rose-500/70 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                    : imageMode
                      ? "border-bone-700 bg-bone-800/60 text-bone-300 hover:border-rose-500/60 hover:text-rose-100"
                      : "border-bone-800 bg-bone-900/60 text-bone-500 hover:border-bone-700",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <span aria-hidden="true" className="text-[10px] font-semibold">
                  18+
                </span>
                <span>Adult</span>
              </button>
            </div>

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

      {/* Suggestion bar — row of category chips that expand into a
          full-width panel (Claude-style tab swap). Picking an item
          pastes its full prompt text into the textarea above and
          collapses the panel. Bar hides entirely when no active groups
          exist (admin-curated via /admin/ai/prompts). */}
      <PromptGroupBar
        groups={promptGroups}
        onPick={(prompt) => setContent(prompt)}
        disabled={submitting}
      />
    </div>
  );
}
