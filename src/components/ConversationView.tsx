"use client";

import { useRouter } from "next/navigation";
import { ChatInput } from "@/components/ChatInput";
import { MessageList } from "@/components/MessageList";
import { useChatPolling } from "@/lib/hooks/use-chat-polling";
import type {
  ConversationCharacterDTO,
  PostMessageResponse,
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

  async function handleSubmit(content: string) {
    const res = await fetch(
      `/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    if (!res.ok) {
      throw new Error(`send failed: ${res.status}`);
    }
    const data = (await res.json()) as PostMessageResponse;
    if ("message" in data) {
      // Optimistic append so the user's own message shows up immediately.
      // The polling cursor dedupes by id so there's no double-render.
      appendMessages([data.message]);
    }
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col">
      {/* Header — sticky-ish, sits above the scroll area. The pl-12 on
          mobile leaves room for the SidebarShell hamburger. */}
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

      {messages === null ? (
        <div className="flex flex-1 items-center justify-center text-sm text-bone-400">
          Loading…
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-red-300">
          Couldn&rsquo;t load the chat: {error}
        </div>
      ) : (
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          typingCharacterName={character.displayName}
          emptyState={
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm italic text-bone-300">
                {character.displayName} is ready when you are.
              </p>
            </div>
          }
        />
      )}

      <ChatInput onSubmit={handleSubmit} />
    </div>
  );
}
