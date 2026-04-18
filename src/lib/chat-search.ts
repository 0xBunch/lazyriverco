import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Postgres FTS over Conversation.title. Returns conversation IDs
 * ranked by relevance (ts_rank), then by lastMessageAt DESC as tiebreak.
 * Owner-scoped — never leaks another user's conversations.
 *
 * The /chats page hydrates these ids via prisma.conversation.findMany
 * with additional WHERE filters (view = active/starred/archived, optional
 * characterId). Keeping FTS owner-only keeps the function single-purpose
 * and lets the page own the view-state filter.
 *
 * Hits the conversation_search_tsv() functional GIN index added in
 * prisma/migrations/20260418140000_chat_search_v1. Callers MUST invoke
 * the same single-arg function call in WHERE for the planner to use
 * the index — do not inline `to_tsvector(...)` here.
 *
 * Title-only by design in v1; message-content search is deferred (would
 * need either a per-Conversation aggregated tsvector materialized
 * somewhere or a separate Message GIN with correlated subqueries).
 */
export async function searchConversationIdsForOwner(
  userId: string,
  query: string,
  limit: number,
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Conversation"
    WHERE "ownerId" = ${userId}
      AND conversation_search_tsv("title")
          @@ plainto_tsquery('english', ${trimmed})
    ORDER BY ts_rank(
               conversation_search_tsv("title"),
               plainto_tsquery('english', ${trimmed})
             ) DESC,
             "lastMessageAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}
