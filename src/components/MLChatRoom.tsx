"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessageDTO } from "@/lib/chat";
import {
  MLChatMessage,
  shouldShowHeader,
} from "@/components/MLChatMessage";
import { MLChatComposer } from "@/components/MLChatComposer";
import { type MLChatPostResponse } from "@/lib/mlchat/types";

// Main room client component. Receives an SSR'd `initialMessages` list
// (oldest-first), opens an EventSource against /api/mlchat/stream for
// real-time fan-out, and reconciles new arrivals into the same list.
//
// Invariants:
//   - `messages` is always oldest-first chronological, no holes
//   - dedup is by message.id — a message arriving via both POST-response
//     AND SSE fan-out only renders once
//   - auto-scroll only pins to bottom when the user was already near the
//     bottom (within AUTOSCROLL_THRESHOLD_PX); otherwise the scroll
//     position stays put so reading history isn't yanked away

type MLChatRoomProps = {
  currentUserId: string;
  initialMessages: ChatMessageDTO[];
};

const AUTOSCROLL_THRESHOLD_PX = 80;

// Backoff for SSE reconnect when EventSource itself doesn't auto-recover.
// Bounded so a long Railway outage doesn't spam reconnects but patient
// enough that a 30s redeploy doesn't wake every tab.
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

type StreamStatus = "connecting" | "live" | "reconnecting" | "offline";

/**
 * Lightweight runtime guard at the SSE→state boundary. Server is the
 * only producer, but a malformed payload would inject `undefined`/`{}`
 * into the message list and crash the next render. Cheap to validate
 * before mutating state.
 */
function isChatMessageDTO(value: unknown): value is ChatMessageDTO {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.content === "string" &&
    typeof v.createdAt === "string" &&
    (v.authorType === "USER" || v.authorType === "CHARACTER") &&
    !!v.author &&
    typeof v.author === "object" &&
    typeof (v.author as Record<string, unknown>).id === "string"
  );
}

export function MLChatRoom({
  currentUserId,
  initialMessages,
}: MLChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the user is anchored to the bottom — flips false when
  // they scroll up, flips true when they're back within
  // AUTOSCROLL_THRESHOLD_PX of the bottom. Initial value is `true` so the
  // first arrival after mount paints into view.
  const stickToBottomRef = useRef(true);

  const upsertMessage = useCallback((incoming: ChatMessageDTO) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === incoming.id);
      if (idx === -1) return [...prev, incoming];
      // Replace in place. Future agent-reply token deltas (PR 2) upsert
      // on the same id; positional stability keeps the row from bouncing.
      const next = prev.slice();
      next[idx] = incoming;
      return next;
    });
  }, []);

  // ---- SSE connection lifecycle ----
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function open() {
      if (cancelled) return;
      setStreamStatus(attempt === 0 ? "connecting" : "reconnecting");
      es = new EventSource("/api/mlchat/stream");

      es.addEventListener("connected", () => {
        if (cancelled) return;
        attempt = 0;
        setStreamStatus("live");
      });

      es.addEventListener("new_message", (event) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse((event as MessageEvent).data) as {
            message: unknown;
          };
          if (!isChatMessageDTO(parsed.message)) {
            console.warn("[mlchat] dropping malformed new_message", parsed);
            return;
          }
          upsertMessage(parsed.message);
        } catch (e) {
          console.error("[mlchat] failed to parse new_message event", e);
        }
      });

      // ping events are pure keepalive — their arrival is the signal.
      es.addEventListener("ping", () => {});

      es.addEventListener("error", () => {
        if (cancelled) return;
        // EventSource fires `error` on transient blips and reconnects on
        // its own (readyState=CONNECTING). Only back off when it
        // permanently failed (readyState=CLOSED).
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          const delay =
            RECONNECT_DELAYS_MS[
              Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)
            ];
          attempt += 1;
          setStreamStatus("reconnecting");
          reconnectTimer = setTimeout(open, delay);
        }
      });
    }

    open();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (es) {
        es.close();
        es = null;
      }
      setStreamStatus("offline");
    };
  }, [upsertMessage]);

  // Auto-scroll to bottom on new arrivals when sticky. Initial mount
  // also covered: stickToBottomRef starts `true`, so the first run after
  // hydration snaps the viewport to the latest messages.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickToBottomRef.current = distanceFromBottom <= AUTOSCROLL_THRESHOLD_PX;
  }

  const handleSubmit = useCallback(
    async (content: string) => {
      const res = await fetch("/api/mlchat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await res.json().catch(() => null)) as
        | MLChatPostResponse
        | null;
      if (!res.ok) {
        const msg =
          data && "error" in data
            ? data.error
            : `HTTP ${res.status} (${res.statusText || "request failed"})`;
        throw new Error(msg);
      }
      if (data && "message" in data) {
        // Insert immediately so the bubble is visible even if SSE is
        // briefly disconnected. The fan-out arrival upserts the same id.
        upsertMessage(data.message);
        // After our own send, snap to bottom even if the user was
        // reading history a moment ago.
        stickToBottomRef.current = true;
      }
    },
    [upsertMessage],
  );

  const rows = useMemo(() => {
    return messages.map((m, i) => {
      const previous = i === 0 ? undefined : messages[i - 1];
      const isMe =
        m.authorType === "USER" && m.author.id === currentUserId;
      return (
        <MLChatMessage
          key={m.id}
          message={m}
          isMe={isMe}
          showHeader={shouldShowHeader(m, previous)}
        />
      );
    });
  }, [messages, currentUserId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bone-950 text-bone-100">
      <header className="flex items-center justify-between border-b border-bone-800 bg-bone-950 px-4 py-3">
        <h1 className="text-base font-semibold tracking-tight text-bone-50">
          <span className="text-bone-500">#</span>mensleague
        </h1>
        {/* Status badge stays silent on "live" (which is ~all the time)
            — confidence is silent, anxiety speaks. */}
        {streamStatus === "live" ? null : (
          <StreamStatusBadge status={streamStatus} />
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-3"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages in #mensleague"
      >
        {rows}
        {messages.length === 0 ? (
          <div className="px-4 pt-8 text-sm text-bone-500">
            drop a line. the others see it the second you send.
          </div>
        ) : null}
      </div>

      <MLChatComposer onSubmit={handleSubmit} />
    </div>
  );
}

function StreamStatusBadge({
  status,
}: {
  status: Exclude<StreamStatus, "live">;
}) {
  const label = {
    connecting: "connecting",
    reconnecting: "reconnecting",
    offline: "offline",
  }[status];
  const dot = {
    connecting: "bg-bone-500 animate-pulse",
    reconnecting: "bg-amber-500 animate-pulse",
    offline: "bg-bone-600",
  }[status];

  return (
    <div
      role="status"
      className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-bone-500"
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </div>
  );
}
