"use client";

import { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO } from "@/lib/chat";
import { extractSafeMediaUrls, isVideoUrl } from "@/lib/safe-media";
import { AgentSuggestionButton } from "@/components/AgentSuggestionButton";
import { AgentAvatar } from "@/components/AgentAvatar";
import { MessageActions } from "@/components/MessageActions";

type ChatMessageProps = {
  message: ChatMessageDTO;
  isMe: boolean;
  showHeader: boolean;
  /** Parent conversation id — used by the per-message share-image route.
   *  Optional so the legacy streaming bubble (id: "streaming") can render
   *  without it; actions are suppressed for streaming messages anyway. */
  conversationId?: string;
  /** When true, renders a blinking cursor after the content — used for
   *  the streaming agent bubble while tokens are still arriving. */
  isStreaming?: boolean;
};

function initials(name: string): string {
  const [first, second] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

// --- Markdown for agent replies -------------------------------------------

function AgentMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Override default elements to match our design tokens.
        // The prose class handles most of it; these are edge-case
        // refinements so links and code blocks don't clash with the
        // dark theme.
        a: ({ children: c, ...props }: { children?: ReactNode; href?: string }) => (
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
            <code
              className="rounded bg-bone-900 px-1 py-0.5 text-xs"
              {...props}
            >
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

// --- ChatMessage component ------------------------------------------------

export function ChatMessage({ message, isMe, showHeader, conversationId, isStreaming = false }: ChatMessageProps) {
  const isCharacter = message.authorType === "CHARACTER";
  const mediaUrls =
    isCharacter && message.content ? extractSafeMediaUrls(message.content) : [];
  const suggestion =
    isCharacter && message.suggestion ? message.suggestion : null;

  return (
    <div
      className={cn(
        "flex gap-3 px-4",
        // showHeader = first message in a run from this author. Give it
        // a full `pt-4` of air. Same-author continuations get `pt-2` so
        // the vertical rhythm matches the 36px left gutter — any tighter
        // and the reserved avatar column feels generous while the text
        // feels cramped.
        showHeader ? "pt-4" : "pt-2",
        isMe && "flex-row-reverse",
      )}
    >
      {/* Avatar column */}
      <div className="w-9 shrink-0">
        {showHeader ? (
          isCharacter ? (
            <AgentAvatar
              character={message.author}
              size="lg"
              tone="accent"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-bone-700 text-xs font-semibold text-bone-100"
            >
              {initials(message.author.displayName)}
            </div>
          )
        ) : null}
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          isMe && "items-end",
        )}
      >
        {showHeader ? (
          <div
            className={cn(
              "mb-1 flex items-baseline",
              isMe && "flex-row-reverse",
            )}
          >
            <span className="text-sm font-semibold text-bone-50">
              {message.author.displayName}
            </span>
          </div>
        ) : null}

        <div
          className={cn(
            "max-w-[min(42rem,100%)] text-sm leading-relaxed",
            isMe
              ? "rounded-2xl rounded-br-md bg-claude-500/90 px-4 py-2 text-bone-50"
              : isCharacter
                ? "text-bone-100"
                : "rounded-2xl rounded-bl-md bg-bone-800 px-4 py-2 text-bone-100",
            // Markdown prose styles for character replies; plain
            // whitespace-pre-wrap for user messages.
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
          {isStreaming ? (
            <span className="ml-0.5 inline-block animate-pulse text-claude-400">
              ▍
            </span>
          ) : null}
        </div>

        {/* Share/copy affordances — only for character messages that are
            fully delivered. The streaming bubble uses id="streaming" and
            passes no conversationId; both flags suppress the actions. */}
        {isCharacter && !isStreaming && conversationId ? (
          <MessageActions message={message} conversationId={conversationId} />
        ) : null}

        {mediaUrls.length > 0 ? (
          <div className="mt-2 flex max-w-[min(42rem,100%)] flex-col gap-2">
            {mediaUrls.map((url) =>
              isVideoUrl(url) ? (
                <video
                  key={url}
                  src={url}
                  controls
                  preload="metadata"
                  className="max-h-80 rounded-xl border border-bone-700 bg-bone-950"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="max-h-80 rounded-xl border border-bone-700 bg-bone-950 object-contain"
                />
              ),
            )}
          </div>
        ) : null}

        {suggestion ? (
          <AgentSuggestionButton
            characterName={suggestion.characterName}
            reason={suggestion.reason}
          />
        ) : null}
      </div>
    </div>
  );
}
