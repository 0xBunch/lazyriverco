// Shared chat message DTO — wire format between the messages API and the
// client feed. Matches the shape specified in TASK 06: authorType at the
// message level (discriminates the row kind), author carries id/name/
// displayName/avatarUrl. No passwordHash ever selected.

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
