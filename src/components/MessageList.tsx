"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChatMessage } from "@/components/ChatMessage";
import { FollowupChips } from "@/components/FollowupChips";
import type { ChatMessageDTO } from "@/lib/chat";

const GROUPING_WINDOW_MS = 2 * 60 * 1000;
const NEAR_BOTTOM_THRESHOLD_PX = 120;

type MessageListProps = {
  messages: ChatMessageDTO[];
  currentUserId: string;
  emptyState?: ReactNode;
  typingCharacterName?: string;
  /** When non-null, renders a streaming agent bubble with a blinking
   *  cursor after the regular messages. Content grows as tokens arrive. */
  streamingMessage?: ChatMessageDTO | null;
  /** Follow-up chip suggestions for the most recent agent turn. When
   *  set, chips render under the last agent message. Cleared by the
   *  parent on new user input or chip click. */
  followupSuggestions?: readonly string[] | null;
  /** Click handler for a follow-up chip — sends the chip text as a
   *  fresh user turn. */
  onFollowupPick?: (text: string) => void;
};

function TypingIndicator({
  name,
  seconds,
}: {
  name: string;
  seconds: number | null;
}) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4">
      <div className="w-9 shrink-0" />
      <div className="flex items-center gap-2 rounded-2xl border-l-2 border-claude-500/60 bg-bone-800/70 px-4 py-2.5">
        <span className="text-xs text-bone-300">
          {name} is thinking
          {seconds !== null && seconds > 0 ? (
            <span className="ml-1 tabular-nums text-bone-400">· {seconds}s</span>
          ) : null}
        </span>
        <span className="flex items-center gap-0.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="inline-block h-1 w-1 animate-bounce rounded-full bg-claude-400"
              style={{
                animationDelay: `${delay}ms`,
                animationDuration: "0.8s",
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

/**
 * Elapsed-seconds counter for the "{agent} is thinking" indicator.
 * Ticks whenever `active` is true; resets to 0 each time it flips true.
 */
function useThinkingSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setSeconds(0);
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

export function MessageList({
  messages,
  currentUserId,
  emptyState,
  typingCharacterName,
  streamingMessage,
  followupSuggestions,
  onFollowupPick,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // Show the legacy typing indicator (fire-and-forget orchestrator path)
  // when there's no active streaming bubble AND the last message is a
  // recent USER message.
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const isAgentTyping =
    !streamingMessage &&
    !!typingCharacterName &&
    !!lastMsg &&
    lastMsg.authorType === "USER" &&
    Date.now() - new Date(lastMsg.createdAt).getTime() < 60_000;

  // "Thinking" UI covers two independent paths:
  //   - streaming bubble exists but no tokens have landed yet
  //   - legacy fire-and-forget orchestrator (no stream, last msg is USER)
  // Both get the same "{name} is thinking · Ns" affordance.
  const streamingEmpty =
    !!streamingMessage && streamingMessage.content.length === 0;
  const showThinking = streamingEmpty || isAgentTyping;
  const thinkingSeconds = useThinkingSeconds(showThinking);

  const thinkingName = streamingEmpty
    ? streamingMessage?.author.displayName ?? null
    : typingCharacterName ?? null;

  // Auto-scroll on new messages, streaming content growth, typing
  // indicator state, or follow-up chips landing.
  useEffect(() => {
    const scroller = scrollRef.current;
    const bottom = bottomRef.current;
    if (!scroller || !bottom) return;
    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX) {
      bottom.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [
    messages,
    showThinking,
    streamingMessage?.content,
    followupSuggestions,
  ]);

  // Chips attach to the last agent message. Only render them when
  //   - there ARE suggestions
  //   - streaming isn't currently mid-flight (chips land AFTER done)
  //   - the last message is actually a CHARACTER turn
  const chipsVisible =
    !!followupSuggestions &&
    followupSuggestions.length > 0 &&
    !streamingMessage &&
    !!lastMsg &&
    lastMsg.authorType === "CHARACTER" &&
    !!onFollowupPick;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto pt-4">
      {messages.length === 0 && !streamingMessage ? (
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

          {/* Follow-up chips for the most recent agent turn. Parent
              clears suggestions on new user input or chip click. */}
          {chipsVisible ? (
            <FollowupChips
              suggestions={followupSuggestions}
              onPick={onFollowupPick}
            />
          ) : null}

          {/* Streaming agent bubble — grows as tokens arrive. We hide it
              while streamingContent is empty; the "thinking" indicator
              below fills that slot with an elapsed-seconds counter. */}
          {streamingMessage && !streamingEmpty ? (
            <motion.div
              key="streaming"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <ChatMessage
                message={streamingMessage}
                isMe={false}
                showHeader={true}
                isStreaming={true}
              />
            </motion.div>
          ) : null}

          {/* Thinking indicator with elapsed-seconds counter. Covers the
              pre-first-token streaming window and the legacy fire-and-
              forget orchestrator window. */}
          {showThinking && thinkingName ? (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <TypingIndicator
                name={thinkingName}
                seconds={thinkingSeconds}
              />
            </motion.div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
