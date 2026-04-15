// Shared chat message DTO — wire format between the messages API and the
// client feed. Keeps passwordHash out (never selected), resolves author name
// + kind, and emits timestamps as ISO strings so JSON round-trips are clean.

export type ChatAuthor = {
  id: string;
  name: string;
  displayName: string;
  kind: "USER" | "CHARACTER";
};

export type ChatMessageDTO = {
  id: string;
  content: string;
  createdAt: string; // ISO
  author: ChatAuthor;
};

export type MessagesResponse = {
  messages: ChatMessageDTO[];
};

export const CHAT_POLL_INTERVAL_MS = 3000;
export const CHAT_PAGE_SIZE = 50;
