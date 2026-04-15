// Shared chat message DTO — wire format between the messages API and the
// client feed. Matches the shape specified in TASK 06: authorType at the
// message level (discriminates the row kind), author carries id/name/
// displayName/avatarUrl. No passwordHash ever selected.

import type { Message } from "@prisma/client";

export type AuthorType = "USER" | "CHARACTER";

export type ChatAuthor = {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ChatMessageDTO = {
  id: string;
  content: string;
  createdAt: string; // ISO
  authorType: AuthorType;
  author: ChatAuthor;
};

export type MessagesResponse = {
  messages: ChatMessageDTO[];
};

export type PostMessageRequest = {
  content: string;
};

export type PostMessageResponse =
  | { message: ChatMessageDTO }
  | { error: string };

export const CHAT_POLL_INTERVAL_MS = 3000;
export const CHAT_PAGE_SIZE = 50;

// Shape of a Prisma message row with the author relations narrowed to the
// fields the chat DTO needs. Kept here so every call site (legacy channel
// API, new conversation API, orchestrator reply writes) uses the same shape.
export type MessageWithAuthors = Message & {
  user: ChatAuthor | null;
  character: ChatAuthor | null;
};

// Prisma `select` clause that matches ChatAuthor exactly. Import from both
// /api/messages and /api/conversations so neither route drifts from this
// file's DTO shape.
export const AUTHOR_SELECT = {
  id: true,
  name: true,
  displayName: true,
  avatarUrl: true,
} as const;

export function toDTO(m: MessageWithAuthors): ChatMessageDTO | null {
  if (m.authorType === "USER" && m.user) {
    return {
      id: m.id,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      authorType: "USER",
      author: m.user,
    };
  }
  if (m.authorType === "CHARACTER" && m.character) {
    return {
      id: m.id,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      authorType: "CHARACTER",
      author: m.character,
    };
  }
  // FK + authorType invariants should make this unreachable. Log loudly
  // rather than silently dropping.
  console.error(
    `[chat] dropping message with impossible author state: id=${m.id} authorType=${m.authorType}`,
  );
  return null;
}
