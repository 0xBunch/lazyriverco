"use client";

import { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/initials";
import { AgentAvatar } from "@/components/AgentAvatar";
import type { ChatMessageDTO } from "@/lib/chat";

// Group-chat bubble. Slack/Discord-shaped: all messages left-aligned
// with avatar + display name + timestamp on top, content below.
//
// Distinct from ChatMessage.tsx (1:1 conversation surface) where USER
// messages mirror to the right in a colored bubble. That pattern reads
// as "you vs them" — wrong for a 7-author room. Here the only signal
// for "this is mine" is a subtle bone-800/30 background tint on the
// row, so KB doesn't lose his own messages in the scroll without the
// social weight of right-alignment.
//
// `showHeader` collapses author runs: a fresh avatar + name appears
// when the previous message has a different author OR when more than
// MESSAGE_RUN_GAP_MS has elapsed since the prior message. The
// header-less continuation rows still reserve the avatar gutter so
// indentation stays grid-aligned.

type MLChatMessageProps = {
  message: ChatMessageDTO;
  isMe: boolean;
  showHeader: boolean;
};

function AgentMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({
          children: c,
          ...props
        }: {
          children?: ReactNode;
          href?: string;
        }) => (
          <a
            {...props}
            className="text-claude-300 underline decoration-claude-500/40 underline-offset-2 hover:text-claude-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claude-500"
            target="_blank"
            rel="noopener noreferrer"
          >
            {c}
          </a>
        ),
        code: ({
          children: c,
          className,
          ...props
        }: {
          children?: ReactNode;
          className?: string;
        }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <code
                className="block overflow-x-auto rounded-lg bg-bone-950 px-3 py-2 text-xs"
                {...props}
              >
                {c}
              </code>
            );
          }
          return (
            <code className="rounded bg-bone-900 px-1 py-0.5 text-xs" {...props}>
              {c}
            </code>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

// Conversational timestamp ladder: "now" / "2m" / "14m" / "11:42pm" /
// "yesterday" / "Mar 14". Built for room rhythm — recent messages read
// as short relative deltas the way you'd narrate a chat to a friend;
// older messages collapse to a date once the relative form would lie
// about freshness. Lowercase to match the project's voice.
function formatTimestamp(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - t) / 1000));

  if (diffSec < 30) return "now";
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;

  const d = new Date(iso);
  const today = new Date();
  const isSameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isSameDay) {
    return d
      .toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return "yesterday";

  // Older than yesterday: short month + day, e.g. "Mar 14".
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MLChatMessage({ message, isMe, showHeader }: MLChatMessageProps) {
  const isCharacter = message.authorType === "CHARACTER";

  return (
    <div
      className={cn(
        "group/row flex gap-3 px-4 transition-colors",
        showHeader ? "pt-3" : "pt-0.5",
        "pb-0.5",
        // Self-tint hover-deepened so a long row of user-authored msgs
        // is scannable without the chat feeling colored-in.
        isMe ? "bg-bone-800/15 hover:bg-bone-800/25" : "hover:bg-bone-900/40",
      )}
    >
      {/* Avatar gutter — always 36px wide so continuation rows stay
          aligned with header rows. */}
      <div className="w-9 shrink-0">
        {showHeader ? (
          isCharacter ? (
            <AgentAvatar character={message.author} size="lg" tone="accent" />
          ) : (
            <div
              aria-hidden="true"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
                isMe
                  ? "bg-claude-500/25 text-claude-100 ring-1 ring-claude-400/30"
                  : "bg-bone-700 text-bone-100 ring-1 ring-black/30",
              )}
            >
              {initialsOf(message.author.displayName)}
            </div>
          )
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {showHeader ? (
          <div className="mb-0.5 flex items-baseline gap-2">
            <span
              className={cn(
                "text-sm font-semibold",
                isCharacter ? "text-claude-200" : "text-bone-50",
              )}
            >
              {message.author.displayName}
            </span>
            <time
              dateTime={message.createdAt}
              title={new Date(message.createdAt).toLocaleString()}
              className="text-xs tabular-nums text-bone-500"
            >
              {formatTimestamp(message.createdAt)}
            </time>
          </div>
        ) : null}

        <div
          className={cn(
            "max-w-[min(48rem,100%)] text-sm leading-relaxed text-bone-100",
            isCharacter
              ? "prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:mb-1 prose-headings:mt-2 prose-headings:text-bone-50"
              : "whitespace-pre-wrap break-words",
          )}
        >
          {isCharacter ? (
            <AgentMarkdown>{message.content}</AgentMarkdown>
          ) : (
            message.content
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Decide whether a row should render its header (avatar + name +
 * timestamp) or collapse as a continuation. Used by MLChatRoom when
 * walking the chronological message list.
 */
const MESSAGE_RUN_GAP_MS = 5 * 60 * 1000;

export function shouldShowHeader(
  current: ChatMessageDTO,
  previous: ChatMessageDTO | undefined,
): boolean {
  if (!previous) return true;
  if (previous.authorType !== current.authorType) return true;
  if (previous.author.id !== current.author.id) return true;
  const gap =
    new Date(current.createdAt).getTime() -
    new Date(previous.createdAt).getTime();
  if (gap > MESSAGE_RUN_GAP_MS) return true;
  return false;
}
