"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHAT_POLL_INTERVAL_MS,
  type ChatMessageDTO,
  type MessagesResponse,
} from "@/lib/chat";

export type UseChatPollingOptions = {
  /**
   * Endpoint that returns a MessagesResponse. Parametrized so the same hook
   * serves legacy channel polling (/api/messages) and per-conversation
   * polling (/api/conversations/[id]/messages).
   */
  fetchUrl: string;
  /** Poll cadence override. Defaults to the project-wide CHAT_POLL_INTERVAL_MS. */
  pollMs?: number;
};

export type UseChatPollingReturn = {
  messages: ChatMessageDTO[] | null;
  error: string | null;
  /**
   * Append new messages, dedup'd by id. Exposed so the caller's submit
   * handler can optimistically render the user's own message without
   * waiting for the next poll tick.
   */
  appendMessages: (incoming: ChatMessageDTO[]) => void;
};

async function fetchMessages(
  url: string,
  after?: string,
): Promise<ChatMessageDTO[]> {
  const finalUrl = after
    ? `${url}${url.includes("?") ? "&" : "?"}after=${encodeURIComponent(after)}`
    : url;
  const res = await fetch(finalUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`messages fetch: ${res.status}`);
  const data = (await res.json()) as MessagesResponse;
  return data.messages;
}

export function useChatPolling({
  fetchUrl,
  pollMs = CHAT_POLL_INTERVAL_MS,
}: UseChatPollingOptions): UseChatPollingReturn {
  const [messages, setMessages] = useState<ChatMessageDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep latest messages in a ref so the polling interval can read the newest
  // cursor without being in its deps (which would thrash the interval clock).
  const messagesRef = useRef<ChatMessageDTO[] | null>(null);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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

  // Initial load. Re-fires if fetchUrl changes so a caller that switches
  // conversations gets a fresh slate without manual remounting.
  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError(null);
    fetchMessages(fetchUrl)
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
  }, [fetchUrl]);

  // Polling loop. Reads the current tail via messagesRef so the interval
  // doesn't thrash when new messages arrive. Pauses if the tab is hidden.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const current = messagesRef.current;
      if (!current) return; // initial load hasn't resolved yet
      const last = current[current.length - 1];
      try {
        const fresh = await fetchMessages(fetchUrl, last?.createdAt);
        if (!cancelled) appendMessages(fresh);
      } catch {
        // swallow — polling stays silent per spec
      }
    };

    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [appendMessages, fetchUrl, pollMs]);

  return { messages, error, appendMessages };
}
