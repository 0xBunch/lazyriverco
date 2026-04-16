"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChatMessage } from "@/components/ChatMessage";
import type { ChatMessageDTO } from "@/lib/chat";

const GROUPING_WINDOW_MS = 2 * 60 * 1000;
const NEAR_BOTTOM_THRESHOLD_PX = 120;

type MessageListProps = {
  messages: ChatMessageDTO[];
  currentUserId: string;
  emptyState?: ReactNode;
  /** Character name for the typing indicator. When set and the last
   *  message is a recent USER message, a "thinking" shimmer renders
   *  below the message list. */
  typingCharacterName?: string;
};

function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4">
      <div className="w-9 shrink-0" />
      <div className="flex items-center gap-2 rounded-2xl border-l-2 border-claude-500/60 bg-bone-800/70 px-4 py-2.5">
        <span className="text-xs text-bone-300">{name} is thinking</span>
        <span className="flex items-center gap-0.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="inline-block h-1 w-1 rounded-full bg-claude-400 animate-bounce"
              style={{ animationDelay: `${delay}ms`, animationDuration: "0.8s" }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  currentUserId,
  emptyState,
  typingCharacterName,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // Show the typing indicator when the last message is a recent USER
  // message — meaning the orchestrator is likely still running. Hides
  // once a CHARACTER message lands (via the next poll tick), or if the
  // USER message is older than 60s (orchestrator probably failed).
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const isAgentTyping =
    !!typingCharacterName &&
    !!lastMsg &&
    lastMsg.authorType === "USER" &&
    Date.now() - new Date(lastMsg.createdAt).getTime() < 60_000;

  useEffect(() => {
    const scroller = scrollRef.current;
    const bottom = bottomRef.current;
    if (!scroller || !bottom) return;
    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX) {
      bottom.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isAgentTyping]);

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
              <motion.div
                key={m.id}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <ChatMessage
                  message={m}
                  isMe={isMe}
                  showHeader={showHeader}
                />
              </motion.div>
            );
          })}
          {isAgentTyping ? (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <TypingIndicator name={typingCharacterName!} />
            </motion.div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
