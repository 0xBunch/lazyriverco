"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatInput } from "@/components/ChatInput";
import { MessageList } from "@/components/MessageList";
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
};

function initials(name: string): string {
  const [first, second] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

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

// --------------------------------------------------------------------------

export function ConversationView({
  conversationId,
  character,
  title,
  currentUserId,
}: ConversationViewProps) {
  const router = useRouter();
  const { messages, error, appendMessages } = useChatPolling({
    fetchUrl: `/api/conversations/${conversationId}/messages`,
  });

  // Streaming state: null = idle, string = accumulated agent text
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const isStreaming = streamingContent !== null;
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(
    (content: string) => {
      if (isStreaming) return;
      // Fire the stream in the background — DON'T return a Promise so
      // ChatInput clears immediately. The `disabled` prop keeps it locked
      // until the stream finishes.
      void (async () => {
        setStreamingContent("");
        const abort = new AbortController();
        abortRef.current = abort;

        try {
          const res = await fetch(
            `/api/conversations/${conversationId}/stream`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content }),
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
                  setStreamingContent(
                    (prev) => (prev ?? "") + (data.delta as string),
                  );
                  break;
                case "done":
                  if (data.message) {
                    appendMessages([data.message as ChatMessageDTO]);
                  }
                  setStreamingContent(null);
                  break;
                case "error":
                  console.error("[stream] server:", data.message);
                  setStreamingContent(null);
                  break;
              }
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("[stream] client error:", err);
        } finally {
          setStreamingContent(null);
          abortRef.current = null;
        }
      })();
    },
    [conversationId, isStreaming, appendMessages],
  );

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
            <div
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-claude-500/25 text-xs font-semibold text-claude-100"
            >
              {initials(character.displayName)}
            </div>
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
          <button
            type="button"
            onClick={() => router.push("/")}
            className={cn(
              "shrink-0 rounded-lg border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-200 transition-colors",
              "hover:border-claude-500/60 hover:text-claude-50",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
            )}
          >
            + New chat
          </button>
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
          typingCharacterName={
            !isStreaming ? character.displayName : undefined
          }
          streamingMessage={streamingMessage}
          emptyState={
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm italic text-bone-300">
                {character.displayName} is ready when you are.
              </p>
            </div>
          }
        />
      )}

      <ChatInput onSubmit={handleSubmit} disabled={isStreaming} />
    </div>
  );
}
