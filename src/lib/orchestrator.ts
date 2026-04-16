import Anthropic from "@anthropic-ai/sdk";
import type { Character, Message, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generateCharacterResponse,
  type ChatContextLine,
} from "@/lib/anthropic";
import { DEFAULT_CHANNEL_ID } from "@/lib/channels";
import { buildRichContext } from "@/lib/character-context";
import { selectContext } from "@/lib/select-context";
import { getUpcomingCalendarEntries } from "@/lib/calendar-context";
import { parseSentinel } from "@/lib/agent-sentinels";

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
// Max chars we persist as a CHARACTER reply. The Anthropic call already
// caps at max_tokens: 200 (~800 chars typical), so this is mainly defense-
// in-depth against a streaming regression or runaway output — per
// security-sentinel L4.
const MAX_REPLY_CHARS = 8_000;

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
   * Exactly one of channelId / conversationId must be set. The DB
   * CHECK constraint added in the phase-1 migration enforces this at
   * write time; the runtime guard below fails fast with a clearer
   * error message when the invariant is violated at a call site.
   */
  channelId?: string | null;
  conversationId?: string | null;
  parentId?: string | null;
  /**
   * Optional transaction client. When provided, the message create
   * runs inside the caller's prisma.$transaction so related writes
   * (e.g. Conversation.lastMessageAt bump) stay atomic.
   */
  tx?: Prisma.TransactionClient;
};

export async function createCharacterReply(
  options: CreateCharacterReplyOptions,
): Promise<Message> {
  const {
    character,
    content,
    channelId = null,
    conversationId = null,
    parentId = null,
    tx,
  } = options;

  const hasChannel = channelId != null;
  const hasConversation = conversationId != null;
  if (hasChannel === hasConversation) {
    throw new Error(
      `createCharacterReply: exactly one of channelId/conversationId must be set (got channelId=${String(channelId)}, conversationId=${String(conversationId)})`,
    );
  }

  const client = tx ?? prisma;
  return client.message.create({
    data: {
      content,
      authorType: "CHARACTER",
      characterId: character.id,
      module: "chat",
      channelId,
      conversationId,
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
        // Legacy channel path: includeMedia=false to preserve behavior;
        // the new runConversationOrchestrator (Task 4) passes true.
        const richContext = await buildRichContext({
          characterId: character.id,
          participantUserIds,
          includeMedia: false,
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

// --- Conversation orchestrator -------------------------------------------

/**
 * Per-conversation orchestrator for the personal-chat surface.
 *
 * Fire-and-forget from POST /api/conversations and POST
 * /api/conversations/[id]/messages. One agent per thread, fixed at
 * Conversation.characterId — no @mention picking, no stagger, no
 * responder loop. Shares loadMessageContext + createCharacterReply
 * with runOrchestrator (Task 0d extraction) so prompt assembly and
 * reply writes stay in one place.
 *
 * Security posture:
 *   - Reply is truncated to MAX_REPLY_CHARS before persistence
 *     (security-sentinel L4 — guards against runaway model output).
 *   - Raw truncated content (including any <suggest-agent> tag) is
 *     stored; toDTO strips the sentinel on every read and emits
 *     `suggestion` on the client DTO. No separate column needed.
 *   - A sentinel-only reply is dropped rather than writing an empty
 *     bubble with a floating handoff CTA.
 *   - CHARACTER-authored messages never trigger a reply (no self-loop).
 */
export async function runConversationOrchestrator(
  messageId: string,
): Promise<void> {
  try {
    // 1. Hydrate: the triggering message, its conversation, the
    //    conversation's character, and the triggering user for name
    //    display in the prompt. One round trip.
    const triggerMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        user: { select: { id: true, displayName: true } },
        conversation: {
          include: { character: true },
        },
      },
    });

    if (!triggerMessage) {
      console.error(
        `[conversation-orchestrator] message ${messageId} not found`,
      );
      return;
    }
    if (!triggerMessage.conversation) {
      // Should never fire — this orchestrator is only called from
      // POST /api/conversations/* routes that always set conversationId.
      // Defense in depth: if the wrong orchestrator is fired for a
      // channel message, drop silently rather than crashing.
      console.error(
        `[conversation-orchestrator] message ${messageId} has no conversationId — wrong orchestrator?`,
      );
      return;
    }
    if (triggerMessage.conversation.archivedAt) {
      // User archived the thread between POST and this fire-and-forget
      // tick. Drop silently; no reply to a deleted conversation.
      return;
    }
    if (triggerMessage.authorType !== "USER") {
      // Only USER messages trigger a reply — never self-loop on a
      // CHARACTER reply we just wrote. Defense in depth against a
      // misfired orchestrator call.
      return;
    }
    if (triggerMessage.module !== "chat") return;

    const { conversation } = triggerMessage;
    const character = conversation.character;
    if (!character.active) {
      // Admin deactivated the character between thread start and this
      // fire. Drop silently; the user sees their message but no reply.
      console.warn(
        `[conversation-orchestrator] character ${character.name} is inactive, skipping reply for message ${messageId}`,
      );
      return;
    }

    // 2. Three-way parallel fan-out: load transcript, select relevant
    //    knowledge via Haiku, and fetch upcoming calendar entries.
    const [{ contextLines }, selection, calendarEntries] =
      await Promise.all([
        loadMessageContext({
          where: { conversationId: conversation.id },
          take: CONTEXT_MESSAGES,
          excludeMessageId: triggerMessage.id,
        }),
        selectContext(triggerMessage.content),
        getUpcomingCalendarEntries(),
      ]);

    // 3. Rich context with Haiku-selected lore + media + calendar.
    const richContext = await buildRichContext({
      characterId: character.id,
      participantUserIds: [conversation.ownerId],
      includeMedia: true,
      selectedLoreIds: selection.loreIds,
      selectedMediaIds: selection.mediaIds,
      calendarEntries,
    });

    const newLine: ChatContextLine = {
      displayName: triggerMessage.user?.displayName ?? "?",
      content: triggerMessage.content,
    };

    // 4. Generate the reply (existing 429 retry-once wrapper).
    let rawReply: string;
    try {
      rawReply = await generateWithRetry(
        character,
        contextLines,
        newLine,
        richContext || null,
      );
    } catch (err) {
      console.error(
        `[conversation-orchestrator] ${character.name} failed to generate reply for message ${messageId}:`,
        err,
      );
      return;
    }

    // 5. Defensive truncation. max_tokens already caps the model; this
    //    is insurance against a streaming regression or a prompt-
    //    injection-induced runaway.
    const truncated = rawReply.slice(0, MAX_REPLY_CHARS).trim();
    if (!truncated) {
      console.warn(
        `[conversation-orchestrator] ${character.name} returned empty reply, skipping`,
      );
      return;
    }

    // 6. Peek at the sentinel-stripped version of the reply so we
    //    don't write an empty-bubble message when the model returns
    //    nothing but a <suggest-agent> tag. We store the RAW truncated
    //    content (not `visible`) below so toDTO can re-parse on every
    //    read and emit `suggestion` to the client — stripping here
    //    would lose the suggestion metadata on subsequent loads since
    //    there's no dedicated column for it.
    const activeCharacters = await prisma.character.findMany({
      where: { active: true },
      select: { name: true },
    });
    const allowlist = activeCharacters.map((c) => c.name);
    const { cleaned: visible } = parseSentinel(truncated, allowlist);
    if (!visible.trim()) {
      console.warn(
        `[conversation-orchestrator] ${character.name} returned sentinel-only reply, skipping write`,
      );
      return;
    }

    // 7 + 8. Persist the reply + bump Conversation.lastMessageAt
    //    atomically so the sidebar ordering index and the thread
    //    detail both see a consistent state. Store the raw truncated
    //    content so toDTO can re-parse the sentinel on every read.
    await prisma.$transaction(async (tx) => {
      await createCharacterReply({
        character,
        content: truncated,
        conversationId: conversation.id,
        tx,
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
    });

    console.log(
      `[conversation-orchestrator] ${character.name} replied in conversation ${conversation.id} (${truncated.length} chars)`,
    );
  } catch (err) {
    console.error("[conversation-orchestrator] top-level failure:", err);
  }
}
