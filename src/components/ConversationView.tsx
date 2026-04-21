"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { ChatInput } from "@/components/ChatInput";
import { MessageList } from "@/components/MessageList";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useChatPolling } from "@/lib/hooks/use-chat-polling";
import type {
  ChatMessageDTO,
  ConversationCharacterDTO,
} from "@/lib/chat";
import { cn } from "@/lib/utils";

type ConversationViewProps = {
  conversationId: string;
  character: ConversationCharacterDTO;
  title: string | null;
  currentUserId: string;
  /** Server-fetched pin state — drives the initial star UI without
   *  waiting on a client round-trip. */
  initialPinned: boolean;
};

// --- SSE parser helpers ---------------------------------------------------

type SSEEvent = {
  event: string;
  data: string;
};

function parseSSEChunk(buffer: string): { events: SSEEvent[]; rest: string } {
  const events: SSEEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "";
    let data = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (event && data) events.push({ event, data });
  }
  return { events, rest };
}

// Streaming smoothing — Anthropic's SSE delivers tokens in uneven bursts.
// Rather than setState-per-chunk (which drops jerky text into the DOM),
// we append each delta to an off-React ref buffer and let a single rAF
// loop flush a small number of characters per frame. At ~60fps this
// paints a consistent ~2-8 chars/frame cadence — readable, not choppy.
//
// Catch-up: when the buffer grows large (backlog > CATCH_UP_THRESHOLD),
// we flush more per frame to keep up with a very fast stream. Once the
// final `done` event lands, drainPending flushes everything remaining
// in one go so the user doesn't see a trailing "typing" slow-down after
// the real stream has finished.
const CATCH_UP_THRESHOLD = 40;

// --------------------------------------------------------------------------

export function ConversationView({
  conversationId,
  character,
  title,
  currentUserId,
  initialPinned,
}: ConversationViewProps) {
  const router = useRouter();
  const { messages, error, appendMessages } = useChatPolling({
    fetchUrl: `/api/conversations/${conversationId}/messages`,
  });
  const shouldReduceMotion = useReducedMotion();

  // Streaming state: null = idle, string = accumulated agent text
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const isStreaming = streamingContent !== null;
  const abortRef = useRef<AbortController | null>(null);
  const didAutoStreamRef = useRef(false);
  // Synchronous guard for the "stream already running" check. `isStreaming`
  // is derived from `streamingContent` state, so its closure value can be
  // stale at the start of `runStream` if React hasn't re-rendered yet
  // (e.g. rapid chip click right after a `done` event set content to null
  // one microtask ago). The ref is flipped synchronously and trusted by
  // the guard below.
  const isStreamingRef = useRef(false);

  // Follow-up chip suggestions from the most recent dialogue-mode agent
  // turn. Cleared when user types, clicks a chip, or navigates away.
  const [followups, setFollowups] = useState<string[] | null>(null);

  // Smoothing buffer — sits between raw SSE token events and the React
  // state that feeds the streaming bubble.
  const pendingTokensRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);

  const flushPending = useCallback(() => {
    rafIdRef.current = null;
    const buf = pendingTokensRef.current;
    if (!buf) return;
    // Bigger bites when we're behind, smaller bites when caught up. A
    // completely stalled stream at the tail still flushes 2 chars/frame
    // which feels like natural typing without dragging.
    const backlog = buf.length;
    const takeN = backlog > CATCH_UP_THRESHOLD ? Math.min(backlog, 8) : backlog > 10 ? 4 : 2;
    const slice = buf.slice(0, takeN);
    pendingTokensRef.current = buf.slice(takeN);
    setStreamingContent((prev) => (prev ?? "") + slice);
    if (pendingTokensRef.current) {
      rafIdRef.current = requestAnimationFrame(flushPending);
    }
  }, []);

  const enqueueToken = useCallback(
    (delta: string) => {
      if (!delta) return;
      if (shouldReduceMotion) {
        // Respect reduced motion — no smoothing, append immediately. If
        // the user flipped the OS setting mid-stream, drain anything the
        // rAF path had buffered first so we don't lose tail tokens in
        // the handoff.
        let carry = "";
        if (pendingTokensRef.current) {
          carry = pendingTokensRef.current;
          pendingTokensRef.current = "";
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
        }
        setStreamingContent((prev) => (prev ?? "") + carry + delta);
        return;
      }
      pendingTokensRef.current += delta;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushPending);
      }
    },
    [flushPending, shouldReduceMotion],
  );

  const drainPending = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (pendingTokensRef.current) {
      const rest = pendingTokensRef.current;
      pendingTokensRef.current = "";
      setStreamingContent((prev) => (prev ?? "") + rest);
    }
  }, []);

  // Clean up any in-flight rAF on unmount. (The stream's own finally
  // handles the common case; this covers route changes mid-stream.)
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingTokensRef.current = "";
    };
  }, []);

  // Image-generation mode. When true, the next user-submitted message is
  // treated as an image prompt: we bypass Claude and hit the image-gen
  // provider (see /api/conversations/[id]/stream route). The toggle is
  // sticky — flipping it on keeps subsequent sends in image mode until
  // the user turns it off. Server-side, an env-var kill switch can still
  // refuse the request (503); we surface those failures as SSE errors.
  const [imageMode, setImageMode] = useState(false);

  // Pin state — optimistic toggle with server rollback. No spinner; the
  // write is fast and the visual state flips immediately. If the server
  // rejects, we revert and log. Non-blocking: pinning is never critical
  // path for the chat itself.
  const [pinned, setPinned] = useState(initialPinned);
  const [pinning, setPinning] = useState(false);
  const togglePin = useCallback(async () => {
    if (pinning) return;
    const next = !pinned;
    setPinned(next);
    setPinning(true);
    try {
      const res = await fetch("/api/pins", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        setPinned(!next);
        console.error("[pin] HTTP", res.status);
      } else {
        // Server-component sidebar reads the Pin table directly; refresh
        // so the Starred section reflects the new state on next paint.
        router.refresh();
      }
    } catch (err) {
      setPinned(!next);
      console.error("[pin] network", err);
    } finally {
      setPinning(false);
    }
  }, [conversationId, pinned, pinning, router]);

  // Core streaming function — used by handleSubmit (user types), the
  // auto-trigger effect (initial mount, reply-to-latest mode), and the
  // follow-up chip click handler.
  const runStream = useCallback(
    (body: Record<string, unknown>) => {
      // Synchronous guard — beats the `isStreaming` closure which can
      // be stale if React hasn't re-rendered after a `done` event yet.
      if (isStreamingRef.current) return;
      isStreamingRef.current = true;
      // Belt-and-suspenders: abort any controller we still hold a
      // reference to, and cancel any in-flight rAF. Prevents a slow
      // prior stream from pushing SSE events into the new turn's UI.
      abortRef.current?.abort();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingTokensRef.current = "";
      // Clear any follow-ups from the prior turn — they belong to a
      // specific message, and we're about to make that message stale.
      setFollowups(null);
      setStreamingContent("");
      const abort = new AbortController();
      abortRef.current = abort;

      void (async () => {
        try {
          const res = await fetch(
            `/api/conversations/${conversationId}/stream`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: abort.signal,
            },
          );

          if (!res.ok) {
            const errData = await res
              .json()
              .catch(() => ({ error: "Stream failed" }));
            console.error("[stream] HTTP error:", errData);
            setStreamingContent(null);
            return;
          }
          if (!res.body) {
            setStreamingContent(null);
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const { events, rest } = parseSSEChunk(buffer);
            buffer = rest;

            for (const sse of events) {
              const data = JSON.parse(sse.data);
              switch (sse.event) {
                case "user_message":
                  appendMessages([data.message as ChatMessageDTO]);
                  break;
                case "token":
                  enqueueToken(data.delta as string);
                  break;
                case "done":
                  drainPending();
                  if (data.message) {
                    appendMessages([data.message as ChatMessageDTO]);
                  }
                  setStreamingContent(null);
                  break;
                case "followups":
                  if (
                    Array.isArray(data.suggestions) &&
                    data.suggestions.length > 0
                  ) {
                    setFollowups(
                      (data.suggestions as unknown[])
                        .filter((s): s is string => typeof s === "string")
                        .slice(0, 3),
                    );
                  }
                  break;
                case "error":
                  console.error("[stream] server:", data.message);
                  drainPending();
                  setStreamingContent(null);
                  break;
              }
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("[stream] client error:", err);
        } finally {
          // Only clear state that belongs to THIS stream. If another
          // `runStream` has already started and reassigned `abortRef`,
          // we leave the new stream's state alone.
          if (abortRef.current === abort) {
            drainPending();
            setStreamingContent(null);
            abortRef.current = null;
            isStreamingRef.current = false;
          }
        }
      })();
    },
    [conversationId, appendMessages, enqueueToken, drainPending],
  );

  // User-initiated submit: creates a new USER message + streams the reply.
  // When image mode is on, the server short-circuits Claude and generates
  // an image instead.
  const handleSubmit = useCallback(
    (content: string) => {
      runStream(imageMode ? { content, imageGenerationMode: true } : { content });
    },
    [runStream, imageMode],
  );

  // Follow-up chip click — sends the chip text as a new user turn. Chips
  // always route to Claude, never to image gen, since they're produced by
  // the agent to continue the conversation.
  const handleFollowupPick = useCallback(
    (text: string) => {
      runStream({ content: text });
    },
    [runStream],
  );

  // Auto-trigger: when the initial poll lands and the last message is USER
  // with no CHARACTER reply, stream the first reply immediately. This
  // covers the landing-page flow where POST /api/conversations creates the
  // user message but no longer fires the orchestrator.
  useEffect(() => {
    if (didAutoStreamRef.current) return;
    if (!messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last || last.authorType !== "USER") return;
    // Only auto-trigger if the message is recent (< 30s old) — prevents
    // re-streaming an abandoned conversation on revisit.
    if (Date.now() - new Date(last.createdAt).getTime() > 30_000) return;
    didAutoStreamRef.current = true;
    runStream({}); // empty body = reply-to-latest mode
  }, [messages, runStream]);

  // Build a synthetic ChatMessageDTO for the streaming bubble
  const streamingMessage: ChatMessageDTO | null =
    streamingContent !== null
      ? {
          id: "streaming",
          content: streamingContent,
          createdAt: new Date().toISOString(),
          authorType: "CHARACTER",
          author: {
            id: character.id,
            name: character.name,
            displayName: character.displayName,
            avatarUrl: character.avatarUrl,
          },
        }
      : null;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col">
      {/* Header */}
      <div className="border-b border-bone-700 bg-bone-900/80 px-6 pb-3 pt-4 backdrop-blur md:pt-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 pl-12 md:pl-0">
          <div className="flex min-w-0 items-center gap-3">
            <AgentAvatar character={character} size="lg" tone="accent" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-semibold text-bone-50">
                {character.displayName}
              </h1>
              {title ? (
                <p className="truncate text-xs italic text-bone-400">
                  {title}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Pin toggle — optimistic, non-blocking. Filled gold-ish
                star when pinned, outline when not. */}
            <button
              type="button"
              onClick={togglePin}
              aria-label={pinned ? "Unpin conversation" : "Pin conversation"}
              aria-pressed={pinned}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                pinned
                  ? "border-claude-500/60 bg-claude-500/15 text-claude-300 hover:bg-claude-500/25"
                  : "border-bone-700 bg-bone-800 text-bone-300 hover:border-claude-500/60 hover:text-claude-100",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill={pinned ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>

            {/* Image-generation toggle — flips the next send into txt2img
                mode. Square button matching the pin's dimensions; filled
                state (bg + border) when active. Disabled during a stream
                so the placeholder can't drift out of sync with the reply
                that's already in flight. Server-side env-var kill switch
                can still refuse; SSE error handling surfaces that. */}
            <button
              type="button"
              onClick={() => setImageMode((v) => !v)}
              disabled={isStreaming}
              aria-label={
                imageMode ? "Turn off image generation" : "Turn on image generation"
              }
              aria-pressed={imageMode}
              title={
                imageMode
                  ? "Next message will generate an image"
                  : "Generate image mode"
              }
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                imageMode
                  ? "border-claude-500/60 bg-claude-500/15 text-claude-300 hover:bg-claude-500/25"
                  : "border-bone-700 bg-bone-800 text-bone-300 hover:border-claude-500/60 hover:text-claude-100",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
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
            </button>

            <button
              type="button"
              onClick={() => router.push("/")}
              className={cn(
                "rounded-lg border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-200 transition-colors",
                "hover:border-claude-500/60 hover:text-claude-50",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              )}
            >
              + New chat
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {messages === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-bone-400">
          <div className="flex gap-1.5">
            {[0, 150, 300].map((d) => (
              <div
                key={d}
                className="h-2 w-2 animate-bounce rounded-full bg-bone-600"
                style={{ animationDelay: `${d}ms`, animationDuration: "0.8s" }}
              />
            ))}
          </div>
          Loading conversation…
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-red-300">
          Couldn&rsquo;t load the chat: {error}
        </div>
      ) : (
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          conversationId={conversationId}
          typingCharacterName={
            !isStreaming ? character.displayName : undefined
          }
          streamingMessage={streamingMessage}
          followupSuggestions={followups}
          onFollowupPick={handleFollowupPick}
          emptyState={
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm italic text-bone-300">
                {character.displayName} is ready when you are.
              </p>
            </div>
          }
        />
      )}

      <ChatInput
        onSubmit={handleSubmit}
        disabled={isStreaming}
        placeholder={imageMode ? "Describe an image…" : undefined}
      />
    </div>
  );
}
