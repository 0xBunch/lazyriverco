import Anthropic from "@anthropic-ai/sdk";
import type { Character, Message } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generateCharacterResponse,
  type ChatContextLine,
} from "@/lib/anthropic";

// --- Tuning constants (spec: TASK 07) -------------------------------------

const CONTEXT_MESSAGES = 15;
const COOLDOWN_MESSAGES = 5;
const MAX_RESPONDERS = 2;
const KEYWORD_PROBABILITY = 0.7;
const NAME_MENTION_PROBABILITY = 0.9;
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

function containsAny(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => n && lower.includes(n.toLowerCase()));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary match for character names/displayNames so 2–3 character names
 * (e.g. "ron") don't false-positive on "around", "front", "iron", etc.
 */
function mentionsWord(haystack: string, word: string): boolean {
  if (!word) return false;
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(haystack);
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

type Candidate = {
  character: Character;
  probability: number;
};

/**
 * Decide which characters (if any) should respond to the given message.
 * Implements the spec's scoring + cooldown + top-2 selection.
 */
function pickResponders(
  newMessageContent: string,
  characters: readonly Character[],
  recentAuthors: readonly string[], // character IDs who appear in the last N messages
): Candidate[] {
  const cooldown = new Set(recentAuthors);
  const candidates: Candidate[] = [];

  for (const c of characters) {
    // (a) active in "chat" module
    if (!c.activeModules.includes("chat")) continue;
    if (!c.active) continue;

    // (d) cooldown — character sent in last N messages.
    // Hoisted ahead of steps (b)/(c)/(f) so we don't waste entropy rolling
    // against probabilities we'll immediately discard.
    if (cooldown.has(c.id)) continue;

    // (c): name mention — WORD-BOUNDARY match so short names ("ron") don't
    // false-positive on "around", "front", "iron", etc.
    const nameMention =
      mentionsWord(newMessageContent, c.name) ||
      mentionsWord(newMessageContent, c.displayName);
    // (b): trigger keyword — substring match is fine (users often write
    // fragments like "qb" or emoji/joke tokens that aren't whole words).
    const keywordMatch = containsAny(newMessageContent, c.triggerKeywords);

    let probability: number;
    if (nameMention) {
      probability = NAME_MENTION_PROBABILITY;
    } else if (keywordMatch) {
      probability = KEYWORD_PROBABILITY;
    } else {
      probability = c.responseProbability;
    }

    // (f) roll
    if (Math.random() < probability) {
      candidates.push({ character: c, probability });
    }
  }

  // (4) top MAX_RESPONDERS by probability, stable by character.name for determinism
  return candidates
    .sort((a, b) => {
      if (b.probability !== a.probability) return b.probability - a.probability;
      return a.character.name.localeCompare(b.character.name);
    })
    .slice(0, MAX_RESPONDERS);
}

// --- Rate limit handling --------------------------------------------------

function isRateLimitError(err: unknown): boolean {
  // Prefer the SDK's typed instanceof check — minification and subclassing
  // make string-based `.name` checks fragile.
  return err instanceof Anthropic.APIError && err.status === 429;
}

async function generateWithRetry(
  character: Character,
  contextLines: readonly ChatContextLine[],
  newLine: ChatContextLine,
): Promise<string> {
  try {
    return await generateCharacterResponse(
      character.systemPrompt,
      contextLines,
      newLine,
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
      );
    }
    throw err;
  }
}

// --- Entry point ----------------------------------------------------------

export async function runOrchestrator(messageId: string): Promise<void> {
  try {
    const newMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        user: { select: { id: true, displayName: true } },
        character: { select: { id: true, displayName: true } },
      },
    });
    if (!newMessage) {
      console.error(`[orchestrator] message ${messageId} not found`);
      return;
    }
    if (newMessage.authorType !== "USER") {
      // Only orchestrate on user messages; characters don't trigger other
      // characters (prevents runaway loops).
      return;
    }
    if (newMessage.module !== "chat") return;

    // Pull the last N messages — used for both cooldown and context.
    const recent = await prisma.message.findMany({
      where: { module: "chat" },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_MESSAGES,
      include: {
        user: { select: { id: true, displayName: true } },
        character: { select: { id: true, displayName: true } },
      },
    });

    // Cooldown list: character IDs in the most recent N messages.
    const cooldownCharacters = recent
      .slice(0, COOLDOWN_MESSAGES)
      .map((m) => m.character?.id)
      .filter((id): id is string => Boolean(id));

    const characters = await prisma.character.findMany({
      where: { active: true },
    });

    const responders = pickResponders(
      newMessage.content,
      characters,
      cooldownCharacters,
    );

    if (responders.length === 0) {
      console.log(
        `[orchestrator] no responders for message ${messageId} (content="${newMessage.content.slice(0, 60)}")`,
      );
      return;
    }

    // Build transcript context for the prompt. Reverse to oldest-first and
    // drop the new message itself (it goes in separately as "newLine").
    const contextLines: ChatContextLine[] = recent
      .slice()
      .reverse()
      .filter((m) => m.id !== newMessage.id)
      .map((m) => ({
        displayName: authorDisplayName(m),
        content: m.content,
      }));

    const newLine: ChatContextLine = {
      displayName: authorDisplayName(newMessage),
      content: newMessage.content,
    };

    console.log(
      `[orchestrator] ${responders.length} responder(s) for message ${messageId}: ${responders
        .map((r) => `${r.character.name}@${r.probability.toFixed(2)}`)
        .join(", ")}`,
    );

    for (const [i, responder] of responders.entries()) {
      const { character } = responder;
      try {
        const text = await generateWithRetry(character, contextLines, newLine);
        if (!text) {
          console.warn(
            `[orchestrator] ${character.name} returned empty text, skipping`,
          );
          continue;
        }

        await prisma.message.create({
          data: {
            content: text,
            authorType: "CHARACTER",
            characterId: character.id,
            module: "chat",
          },
        });
        console.log(
          `[orchestrator] ${character.name} responded (${text.length} chars)`,
        );
      } catch (err) {
        console.error(
          `[orchestrator] ${character.name} failed to respond:`,
          err,
        );
        // continue to next responder — never let one failure block others
      }

      // Delay before next responder (skip after the last one).
      if (i < responders.length - 1) {
        await sleep(randomDelay());
      }
    }
  } catch (err) {
    // Top-level catch — the orchestrator is fire-and-forget from the API
    // route, but we still don't want an unhandled rejection in the server.
    console.error("[orchestrator] top-level failure:", err);
  }
}
