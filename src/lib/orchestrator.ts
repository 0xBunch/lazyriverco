import Anthropic from "@anthropic-ai/sdk";
import type { Character, Message, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generateCharacterResponse,
  type ChatContextLine,
} from "@/lib/anthropic";
import { DEFAULT_CHANNEL_ID } from "@/lib/channels";
import { buildRichContext } from "@/lib/character-context";

// --- Tuning constants -----------------------------------------------------
//
// Post-hotfix design: agents speak only when explicitly summoned. Two gates:
//   1. @mention — `@slug` or `@displayname` (case-insensitive, word-boundary)
//      appears anywhere in the message content.
//   2. Reply-to — the new message's `parentId` points to an existing
//      CHARACTER message; that character is eligible.
//
// No probability rolls, no keyword scoring, no cooldowns. Those are all
// artifacts of the auto-invocation model we scrapped. Earlier lessons:
// /Users/bunch/_kcb/lessons.md (2026-04-15).

const CONTEXT_MESSAGES = 15;
const MAX_RESPONDERS = 2;
const MIN_INTER_RESPONSE_MS = 2_000;
const MAX_INTER_RESPONSE_MS = 8_000;
const RATE_LIMIT_RETRY_DELAY_MS = 2_000;

// --- Helpers --------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return (
    MIN_INTER_RESPONSE_MS +
    Math.floor(Math.random() * (MAX_INTER_RESPONSE_MS - MIN_INTER_RESPONSE_MS))
  );
}

/**
 * Extract `@token` mentions from a message. Matches `@` followed by a run of
 * word characters (letters, digits, underscore) OR a hyphen. Hyphen support
 * lets slugs like `@joey-barfdog` work. Case-insensitive by lowercasing at
 * match time — the caller compares against lowercased character.name /
 * character.displayName.
 */
function extractMentionTokens(content: string): string[] {
  const tokens = new Set<string>();
  const re = /@([\w-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    tokens.add(match[1]!.toLowerCase());
  }
  return [...tokens];
}

type MessageAuthor = Message & {
  user: { id: string; displayName: string } | null;
  character: { id: string; displayName: string } | null;
};

function authorDisplayName(m: MessageAuthor): string {
  if (m.authorType === "USER" && m.user) return m.user.displayName;
  if (m.authorType === "CHARACTER" && m.character) return m.character.displayName;
  return "?";
}

// --- Shared context + reply helpers ---------------------------------------
//
// Extracted in Task 0d so the new per-conversation orchestrator (Task 4) can
// reuse them. Neither helper decides WHO responds — that stays in
// runOrchestrator's mention/reply gate. These just load the recent slice
// and write a reply, parametrized on where/channelId/conversationId.

type LoadMessageContextOptions = {
  /**
   * Where clause passed straight to prisma.message.findMany. Current call
   * sites pass `{channelId: DEFAULT_CHANNEL_ID}` (legacy); Task 4 will pass
   * `{conversationId}` (new).
   */
  where: Prisma.MessageWhereInput;
  /** Max messages to fetch. Defaults to CONTEXT_MESSAGES (15). */
  take?: number;
  /**
   * Optional message ID to exclude from contextLines. The triggering
   * message is passed to the LLM separately as `newLine` and shouldn't
   * appear twice in the prompt.
   */
  excludeMessageId?: string;
};

type LoadMessageContextResult = {
  /** Oldest-first context lines ready for the LLM prompt. */
  contextLines: ChatContextLine[];
  /**
   * De-duped human user IDs appearing in the fetched slice. Fed to
   * buildRichContext so member facts + relationship narratives are scoped
   * to the people actually in the conversation.
   */
  participantUserIds: string[];
};

export async function loadMessageContext({
  where,
  take = CONTEXT_MESSAGES,
  excludeMessageId,
}: LoadMessageContextOptions): Promise<LoadMessageContextResult> {
  const recent = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, displayName: true } },
      character: { select: { id: true, displayName: true } },
    },
  });

  const contextLines: ChatContextLine[] = recent
    .slice()
    .reverse()
    .filter((m) => m.id !== excludeMessageId)
    .map((m) => ({
      displayName: authorDisplayName(m),
      content: m.content,
    }));

  // Walk the full slice (not the filtered contextLines) so the triggering
  // message's author still ends up in the set — they're the person the
  // agent is about to reply to.
  const participantUserIds = new Set<string>();
  for (const m of recent) {
    if (m.user) participantUserIds.add(m.user.id);
  }

  return { contextLines, participantUserIds: [...participantUserIds] };
}

type CreateCharacterReplyOptions = {
  character: Pick<Character, "id" | "name">;
  content: string;
  /**
   * Legacy channel write. Task 4 will extend this signature with an
   * optional `conversationId` once the new column exists in the schema
   * (added in Task 1). For now, channel-only.
   */
  channelId: string;
  parentId?: string | null;
};

export async function createCharacterReply({
  character,
  content,
  channelId,
  parentId = null,
}: CreateCharacterReplyOptions): Promise<Message> {
  return prisma.message.create({
    data: {
      content,
      authorType: "CHARACTER",
      characterId: character.id,
      module: "chat",
      channelId,
      parentId,
    },
  });
}

/**
 * Decide which characters (if any) should respond. Pure explicit-summon
 * model: union of @mentioned characters and the reply-target character.
 * Order is deterministic by character.name so repeated runs produce the
 * same responder order for the same input.
 */
function pickResponders(
  mentionTokens: readonly string[],
  parentCharacterId: string | null,
  characters: readonly Character[],
): Character[] {
  const chosen = new Map<string, Character>();

  // (1) @mention matches against character slug (name) or displayName.
  for (const c of characters) {
    if (!c.active) continue;
    const slugHit = mentionTokens.includes(c.name.toLowerCase());
    // displayName may contain spaces/quotes — compare a compact form
    // (lowercased, non-word chars stripped) and also the first word.
    const displayCompact = c.displayName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    const firstWord = c.displayName.toLowerCase().split(/\s+/)[0] ?? "";
    const displayHit =
      mentionTokens.includes(displayCompact) ||
      mentionTokens.includes(firstWord);
    if (slugHit || displayHit) {
      chosen.set(c.id, c);
    }
  }

  // (2) reply-to a character message → that character is eligible.
  if (parentCharacterId) {
    const parent = characters.find(
      (c) => c.id === parentCharacterId && c.active,
    );
    if (parent) {
      chosen.set(parent.id, parent);
    }
  }

  // Stable order by name, capped at MAX_RESPONDERS.
  return [...chosen.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_RESPONDERS);
}

// --- Rate limit handling --------------------------------------------------

function isRateLimitError(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 429;
}

async function generateWithRetry(
  character: Character,
  contextLines: readonly ChatContextLine[],
  newLine: ChatContextLine,
  richContext: string | null,
): Promise<string> {
  try {
    return await generateCharacterResponse(
      character.systemPrompt,
      contextLines,
      newLine,
      richContext,
    );
  } catch (err) {
    if (isRateLimitError(err)) {
      console.warn(
        `[orchestrator] ${character.name} hit rate limit, retrying once`,
      );
      await sleep(RATE_LIMIT_RETRY_DELAY_MS);
      return generateCharacterResponse(
        character.systemPrompt,
        contextLines,
        newLine,
        richContext,
      );
    }
    throw err;
  }
}

// --- Entry point ----------------------------------------------------------

/**
 * @deprecated Legacy group-channel orchestrator. Retire when the Channel
 * surface has zero new writes for 30 days, or when the #mensleague admin
 * UI is removed, whichever first. New per-conversation code uses
 * runConversationOrchestrator (added in Task 4 of the lazy-river phase 1
 * refactor). Kept alive here so existing #mensleague messages still get
 * agent replies via the legacy /api/messages path.
 */
export async function runOrchestrator(messageId: string): Promise<void> {
  try {
    const newMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        user: { select: { id: true, displayName: true } },
        character: { select: { id: true, displayName: true } },
        parent: {
          select: {
            id: true,
            authorType: true,
            characterId: true,
          },
        },
      },
    });
    if (!newMessage) {
      console.error(`[orchestrator] message ${messageId} not found`);
      return;
    }
    if (newMessage.module !== "chat") return;

    // Resolve the explicit summon gates.
    const mentionTokens = extractMentionTokens(newMessage.content);
    const parentCharacterId =
      newMessage.parent?.authorType === "CHARACTER" &&
      newMessage.parent.characterId
        ? newMessage.parent.characterId
        : null;

    if (mentionTokens.length === 0 && !parentCharacterId) {
      // No explicit summon. Silence.
      return;
    }

    const characters = await prisma.character.findMany({
      where: { active: true },
    });

    const responders = pickResponders(
      mentionTokens,
      parentCharacterId,
      characters,
    );

    if (responders.length === 0) {
      console.log(
        `[orchestrator] mention gate matched no known character for message ${messageId}: tokens=[${mentionTokens.join(",")}]`,
      );
      return;
    }

    // Pull context via the shared helper extracted in Task 0d.
    const { contextLines, participantUserIds } = await loadMessageContext({
      where: { channelId: DEFAULT_CHANNEL_ID },
      excludeMessageId: newMessage.id,
    });

    const newLine: ChatContextLine = {
      displayName: authorDisplayName(newMessage),
      content: newMessage.content,
    };

    console.log(
      `[orchestrator] ${responders.length} responder(s) for message ${messageId}: ${responders
        .map((c) => c.name)
        .join(", ")}`,
    );

    for (const [i, character] of responders.entries()) {
      try {
        // Per-responder rich context: same canon + member facts but the
        // relationship narrative is filtered to *this* character's takes.
        const richContext = await buildRichContext({
          characterId: character.id,
          participantUserIds,
        });
        const text = await generateWithRetry(
          character,
          contextLines,
          newLine,
          richContext || null,
        );
        if (!text) {
          console.warn(
            `[orchestrator] ${character.name} returned empty text, skipping`,
          );
          continue;
        }

        await createCharacterReply({
          character,
          content: text,
          channelId: DEFAULT_CHANNEL_ID,
          // Thread the character reply under the same parent when the
          // user was replying-to-character; otherwise leave unlinked.
          parentId: parentCharacterId ? newMessage.parent?.id ?? null : null,
        });
        console.log(
          `[orchestrator] ${character.name} responded (${text.length} chars)`,
        );
      } catch (err) {
        console.error(
          `[orchestrator] ${character.name} failed to respond:`,
          err,
        );
      }

      if (i < responders.length - 1) {
        await sleep(randomDelay());
      }
    }
  } catch (err) {
    console.error("[orchestrator] top-level failure:", err);
  }
}
