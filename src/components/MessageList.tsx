"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import type { ChatMessageDTO } from "@/lib/chat";

const GROUPING_WINDOW_MS = 2 * 60 * 1000;
// Pixels from the bottom of the scroll container to still count as "at bottom".
// If the user has scrolled up more than this, we don't yank them back on new msgs.
const NEAR_BOTTOM_THRESHOLD_PX = 120;

type MessageListProps = {
  messages: ChatMessageDTO[];
  currentUserId: string;
  /**
   * Optional override for the zero-message state. Legacy channel view uses the
   * default "river's quiet" copy; per-conversation view passes its own.
   */
  emptyState?: ReactNode;
};

export function MessageList({
  messages,
  currentUserId,
  emptyState,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto pt-4">
      {messages.length === 0 ? (
        emptyState ?? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-sm italic text-bone-300">
              The river&rsquo;s quiet… for now. Say something.
            </p>
          </div>
        )
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
  );
}
