"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO } from "@/lib/chat";
import { AgentSuggestionButton } from "@/components/AgentSuggestionButton";

type ChatMessageProps = {
  message: ChatMessageDTO;
  isMe: boolean;
  showHeader: boolean;
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

// --- Safe media URL rendering ---------------------------------------------

const MEDIA_ORIGIN: string | null = (() => {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
})();

const MEDIA_KEY_REGEX =
  /^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp|gif|mp4)$/i;

function isSafeMediaUrl(raw: string): boolean {
  if (!MEDIA_ORIGIN) return false;
  try {
    const u = new URL(raw);
    return u.origin === MEDIA_ORIGIN && MEDIA_KEY_REGEX.test(u.pathname);
  } catch {
    return false;
  }
}

function extractSafeMediaUrls(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s<>)]+/g) ?? [];
  const seen = new Set<string>();
  const safe: string[] = [];
  for (const m of matches) {
    const cleaned = m.replace(/[.,;:!?)]+$/, "");
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    if (isSafeMediaUrl(cleaned)) safe.push(cleaned);
  }
  return safe;
}

function isVideoUrl(url: string): boolean {
  return url.toLowerCase().endsWith(".mp4");
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
            className="text-claude-300 underline decoration-claude-500/40 underline-offset-2 hover:text-claude-200"
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

// --- Relative timestamp ----------------------------------------------------

function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string>(() =>
    formatDistanceToNowStrict(new Date(iso), { addSuffix: true }),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setLabel(formatDistanceToNowStrict(new Date(iso), { addSuffix: true }));
    }, 30_000);
    return () => clearInterval(id);
  }, [iso]);
  return (
    <time dateTime={iso} className="text-[0.7rem] text-bone-400">
      {label}
    </time>
  );
}

// --- ChatMessage component ------------------------------------------------

export function ChatMessage({ message, isMe, showHeader, isStreaming = false }: ChatMessageProps) {
  const isCharacter = message.authorType === "CHARACTER";
  const mediaUrls =
    isCharacter && message.content ? extractSafeMediaUrls(message.content) : [];
  const suggestion =
    isCharacter && message.suggestion ? message.suggestion : null;

  return (
    <div
      className={cn(
        "flex gap-3 px-4",
        showHeader ? "pt-4" : "pt-0.5",
        isMe && "flex-row-reverse",
      )}
    >
      {/* Avatar column */}
      <div className="w-9 shrink-0">
        {showHeader ? (
          <div
            aria-hidden="true"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
              isCharacter
                ? "bg-claude-500/25 text-claude-100"
                : "bg-bone-700 text-bone-100",
            )}
          >
            {initials(message.author.displayName)}
          </div>
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
              "mb-1 flex items-baseline gap-2",
              isMe && "flex-row-reverse",
            )}
          >
            <span className="text-sm font-semibold text-bone-50">
              {message.author.displayName}
            </span>
            {isCharacter ? (
              <span
                className="rounded-full bg-claude-500/20 px-1.5 py-[1px] text-[0.65rem] font-medium uppercase tracking-wide text-claude-200"
                aria-label="bot"
              >
                bot
              </span>
            ) : null}
            <RelativeTime iso={message.createdAt} />
          </div>
        ) : null}

        <div
          className={cn(
            "max-w-[min(42rem,100%)] rounded-2xl px-4 py-2 text-sm leading-relaxed",
            isMe
              ? "bg-claude-500/90 text-bone-50 rounded-br-md"
              : isCharacter
                ? "border-l-2 border-claude-500/60 bg-bone-800/70 text-bone-100 rounded-bl-md"
                : "bg-bone-800 text-bone-100 rounded-bl-md",
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
