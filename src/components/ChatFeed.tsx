"use client";

import { ChatInput } from "@/components/ChatInput";
import { MessageList } from "@/components/MessageList";
import { useChatPolling } from "@/lib/hooks/use-chat-polling";
import type { PostMessageResponse } from "@/lib/chat";

type ChatFeedProps = {
  currentUserId: string;
  channel: {
    slug: string;
    displayName: string;
    description: string | null;
  };
};

export function ChatFeed({ currentUserId, channel }: ChatFeedProps) {
  const { messages, error, appendMessages } = useChatPolling({
    fetchUrl: "/api/messages",
  });

  async function handleSubmit(content: string) {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      // Let the ChatInput reset itself; surfacing errors in the feed area
      // will come in a future polish pass.
      throw new Error(`send failed: ${res.status}`);
    }
    const data = (await res.json()) as PostMessageResponse;
    if ("message" in data) {
      // Optimistic append so the user's own message shows up immediately
      // instead of waiting for the next poll tick. The polling cursor
      // dedupes by id so there's no double-render.
      appendMessages([data.message]);
    }
  }

  if (messages === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-bone-400">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-300">
        Couldn&rsquo;t load the chat: {error}
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col">
      {/* Channel header — sticky-ish, sits above the scroll area. The
          pl-16 / md:pl-6 leaves room for the mobile hamburger so the
          title doesn't collide with it. */}
      <div className="border-b border-bone-700 bg-bone-900/80 px-6 pb-3 pt-4 backdrop-blur md:pt-5">
        <div className="mx-auto max-w-3xl pl-12 md:pl-0">
          <h1 className="font-display text-base font-semibold text-bone-50">
            #{channel.slug}
          </h1>
          {channel.description ? (
            <p className="mt-0.5 text-xs italic text-bone-400">
              {channel.description}
            </p>
          ) : null}
        </div>
      </div>

      <MessageList messages={messages} currentUserId={currentUserId} />

      <ChatInput onSubmit={handleSubmit} />
    </div>
  );
}
