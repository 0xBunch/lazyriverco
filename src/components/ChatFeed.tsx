"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import {
  CHAT_POLL_INTERVAL_MS,
  type ChatMessageDTO,
  type MessagesResponse,
  type PostMessageResponse,
} from "@/lib/chat";

type ChatFeedProps = {
  currentUserId: string;
  channel: {
    slug: string;
    displayName: string;
    description: string | null;
  };
};

const GROUPING_WINDOW_MS = 2 * 60 * 1000;
// Pixels from the bottom of the scroll container to still count as "at bottom".
// If the user has scrolled up more than this, we don't yank them back on new msgs.
const NEAR_BOTTOM_THRESHOLD_PX = 120;

async function fetchMessages(after?: string): Promise<ChatMessageDTO[]> {
  const url = after
    ? `/api/messages?after=${encodeURIComponent(after)}`
    : "/api/messages";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`messages fetch: ${res.status}`);
  const data = (await res.json()) as MessagesResponse;
  return data.messages;
}

export function ChatFeed({ currentUserId, channel }: ChatFeedProps) {
  const [messages, setMessages] = useState<ChatMessageDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Keep latest messages in a ref so the polling interval can read the newest
  // cursor without being in its deps (which would thrash the interval clock).
  const messagesRef = useRef<ChatMessageDTO[] | null>(null);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Stable append that dedupes by id (polling can overlap the initial load).
  const appendMessages = useCallback((incoming: ChatMessageDTO[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      if (!prev) return incoming;
      const seen = new Set(prev.map((m) => m.id));
      const additions = incoming.filter((m) => !seen.has(m.id));
      if (additions.length === 0) return prev;
      return [...prev, ...additions];
    });
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    fetchMessages()
      .then((msgs) => {
        if (cancelled) return;
        setMessages(msgs);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Polling loop. Lifetime of the component — never resets on message change.
  // Reads the current tail via messagesRef. Pauses if the tab is hidden.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const current = messagesRef.current;
      if (!current) return; // initial load hasn't resolved yet
      const last = current[current.length - 1];
      try {
        const fresh = await fetchMessages(last?.createdAt);
        if (!cancelled) appendMessages(fresh);
      } catch {
        // swallow — polling stays silent per spec
      }
    };

    const id = setInterval(tick, CHAT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [appendMessages]);

  // Auto-scroll to bottom on new messages, but only if the user was already
  // near the bottom. Scrolling up to re-read shouldn't get yanked back.
  useEffect(() => {
    const scroller = scrollRef.current;
    const bottom = bottomRef.current;
    if (!scroller || !bottom) return;
    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX) {
      bottom.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  async function handleSubmit(content: string) {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      // Let the ChatInput reset itself; surfacing errors in the feed area
      // will come in a future polish pass.
      throw new Error(`send failed: ${res.status}`);
    }
    const data = (await res.json()) as PostMessageResponse;
    if ("message" in data) {
      // Optimistic append so the user's own message shows up immediately
      // instead of waiting for the next poll tick. The polling cursor
      // dedupes by id so there's no double-render.
      appendMessages([data.message]);
    }
  }

  if (messages === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-bone-400">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-300">
        Couldn&rsquo;t load the chat: {error}
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col">
      {/* Channel header — sticky-ish, sits above the scroll area. The
          pl-16 / md:pl-6 leaves room for the mobile hamburger so the
          title doesn't collide with it. */}
      <div className="border-b border-bone-700 bg-bone-900/80 px-6 pb-3 pt-4 backdrop-blur md:pt-5">
        <div className="mx-auto max-w-3xl pl-12 md:pl-0">
          <h1 className="font-display text-base font-semibold text-bone-50">
            #{channel.slug}
          </h1>
          {channel.description ? (
            <p className="mt-0.5 text-xs italic text-bone-400">
              {channel.description}
            </p>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pt-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-sm italic text-bone-300">
              The river&rsquo;s quiet… for now. Say something.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-0 pb-6">
            {messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : undefined;
              const sameAuthor =
                prev?.author.id === m.author.id &&
                prev?.authorType === m.authorType;
              const withinWindow =
                prev &&
                new Date(m.createdAt).getTime() -
                  new Date(prev.createdAt).getTime() <
                  GROUPING_WINDOW_MS;
              const showHeader = !(sameAuthor && withinWindow);
              const isMe =
                m.authorType === "USER" && m.author.id === currentUserId;
              return (
                <ChatMessage
                  key={m.id}
                  message={m}
                  isMe={isMe}
                  showHeader={showHeader}
                />
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <ChatInput onSubmit={handleSubmit} />
    </div>
  );
}
