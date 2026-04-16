"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO } from "@/lib/chat";
import { AgentSuggestionButton } from "@/components/AgentSuggestionButton";

type ChatMessageProps = {
  message: ChatMessageDTO;
  /** True when this message is sent by the currently-authed user. */
  isMe: boolean;
  /** True when this is the first message in a 2-minute author cluster. */
  showHeader: boolean;
};

function initials(name: string): string {
  const [first, second] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

// --- Safe media URL rendering ---------------------------------------------
//
// Auto-detect URLs in agent-authored content that point at our R2 bucket
// and render them as <img> previews below the message bubble. Strict
// allow-list: the URL must (a) have the exact origin configured via
// NEXT_PUBLIC_R2_PUBLIC_BASE_URL and (b) match the server-generated
// `media/<uuid>.<ext>` key shape from r2.ts. Any URL that doesn't match
// BOTH conditions stays as plain text.
//
// Security rationale (security-sentinel M2):
//   - A loose substring match would let prompt-injected `https://evil.com/pixel.png`
//     exfil conversation content via referrer or URL params. Host-exact
//     + path-regex closes that hole.
//   - `<img src={url}>` is set via a React prop, not HTML string
//     interpolation, so React escapes the attribute automatically.
//   - referrerPolicy="no-referrer" on the <img> prevents the browser
//     from leaking the conversation URL to the image host even if the
//     host is trusted.

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
    // Strip trailing punctuation from common prose patterns like
    // "check out https://example.com/foo.jpg." or "(https://...)"
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

// Relative timestamp. Seeded with the computed label so there's no flash of
// empty state on first paint. `formatDistanceToNowStrict` is deterministic
// for a given ISO, so SSR and CSR agree.
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

export function ChatMessage({ message, isMe, showHeader }: ChatMessageProps) {
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
      {/* Avatar column — fixed width even when hidden, keeps text aligned. */}
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
            "whitespace-pre-wrap break-words",
            isMe
              ? "bg-claude-500/90 text-bone-50 rounded-br-md"
              : isCharacter
                ? "border-l-2 border-claude-500/60 bg-bone-800/70 text-bone-100 rounded-bl-md"
                : "bg-bone-800 text-bone-100 rounded-bl-md",
          )}
        >
          {message.content}
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
