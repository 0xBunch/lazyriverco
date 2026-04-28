// MLChat shared types. The message DTO itself is reused as-is from
// src/lib/chat.ts (ChatMessageDTO) — every author field a 1:1
// conversation needs, the room needs too.

import type { ChatMessageDTO } from "@/lib/chat";

/**
 * Payload shape emitted by the `mlchat_message_notify` Postgres trigger
 * (see prisma/migrations/20260427230000_mlchat_v01/migration.sql). The
 * listener validates this shape via isNewMessagePayload before fan-out.
 */
export type NewMessagePayload = {
  kind: "new_message";
  messageId: string;
  channelId: string;
  authorType: "USER" | "CHARACTER";
  mentionedAgentIds: string[];
  /** ISO-8601 UTC string emitted by the trigger via to_char. */
  createdAt: string;
};

export type MLChatPostResponse =
  | { message: ChatMessageDTO }
  | { error: string };

export const MLCHAT_PAGE_SIZE = 50;
export const MLCHAT_MAX_CONTENT_LENGTH = 4000;
