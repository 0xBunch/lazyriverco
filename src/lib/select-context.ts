import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { trackedMessagesCreate } from "@/lib/usage";

// Two-pass context selection: a fast Haiku call reads a "table of
// contents" of all Lore entries + READY Media entries, then picks the
// ones relevant to the user's message. Only the selected entries get
// injected into the Sonnet system prompt, replacing the old "dump
// everything" approach.
//
// Cost: ~$0.002/message (~$2-3/month at 1K messages).
// Latency: 200-400ms, runs in parallel with loadMessageContext so
// zero serial latency added to the hot path.

const SELECTION_MODEL = "claude-haiku-4-5" as const;
const SELECTION_MAX_TOKENS = 200;
const SELECTION_TIMEOUT_MS = 2_000;
const MAX_SELECTED_LORE = 5;
const MAX_SELECTED_MEDIA = 5;

const SELECTION_SYSTEM_PROMPT = `You are a relevance filter for an AI chat platform called LAZYRIVER.CO — the corporate extranet of the Lazy River Corporation, a subsidiary of Mens League.

You will receive:
1. A user message from a conversation with an AI character
2. A table of contents listing available Lore entries (text knowledge) and Media entries (images, videos, links)

Your job: return a JSON object identifying which entries are relevant to the user's message and would help the AI character give a better response.

Rules:
- Return ONLY valid JSON: { "loreIds": ["id1", "id2"], "mediaIds": ["id3"] }
- Max 5 lore entries, max 5 media entries
- Only include entries that are genuinely relevant to the topic
- If nothing is relevant, return { "loreIds": [], "mediaIds": [] }
- Do NOT include any text outside the JSON object`;

export type SelectContextResult = {
  loreIds: string[];
  mediaIds: string[];
};

// Lazy singleton — same pattern as the main Anthropic client in
// anthropic.ts. Separate instance so the selection call doesn't
// share rate-limit state with the main generation call.
let _selectionClient: Anthropic | null = null;
function getSelectionClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("<")) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  if (!_selectionClient) {
    _selectionClient = new Anthropic({ apiKey });
  }
  return _selectionClient;
}

function buildTableOfContents(
  loreEntries: { id: string; topic: string; tags: string[] }[],
  mediaEntries: {
    id: string;
    caption: string | null;
    tags: string[];
    type: string;
  }[],
): string {
  const sections: string[] = [];

  if (loreEntries.length > 0) {
    const lines = loreEntries.map(
      (e) =>
        `- [${e.id}] "${e.topic}" (tags: ${e.tags.length > 0 ? e.tags.join(", ") : "none"})`,
    );
    sections.push(["## Lore", ...lines].join("\n"));
  }

  if (mediaEntries.length > 0) {
    const lines = mediaEntries.map(
      (e) =>
        `- [${e.id}] [${e.type}] "${e.caption ?? "untitled"}" (tags: ${e.tags.length > 0 ? e.tags.join(", ") : "none"})`,
    );
    sections.push(["## Media", ...lines].join("\n"));
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "(No lore or media entries available)";
}

export type SelectContextOptions = {
  /** The requesting user — recorded on the usage event for this Haiku
   *  call. `null` is acceptable when the caller genuinely has no user
   *  in scope (none currently, but kept flexible). */
  userId?: string | null;
  /** Active conversation id. Threaded onto the usage event so admin
   *  usage views can collapse pre-reply Haiku cost into the same
   *  conversation as the Sonnet reply that follows it. */
  conversationId?: string | null;
};

/**
 * Two-pass context selection. Runs a fast Haiku call to pick which Lore
 * and Media entries are relevant to the user's message. Returns validated
 * IDs (hallucinated IDs are silently discarded).
 *
 * Graceful degradation: on ANY error (rate limit, timeout, malformed
 * JSON), returns empty arrays — the agent still gets canon + member
 * facts + relationships + calendar. Exactly today's behavior.
 */
export async function selectContext(
  userMessage: string,
  opts: SelectContextOptions = {},
): Promise<SelectContextResult> {
  const empty: SelectContextResult = { loreIds: [], mediaIds: [] };

  try {
    // 1. Build the table of contents from DB
    const [loreEntries, mediaEntries] = await Promise.all([
      prisma.lore.findMany({
        where: { isCore: false },
        select: { id: true, topic: true, tags: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.media.findMany({
        where: { status: "READY" },
        select: { id: true, caption: true, tags: true, type: true },
      }),
    ]);

    // Nothing to select from — skip the Haiku call entirely
    if (loreEntries.length === 0 && mediaEntries.length === 0) {
      return empty;
    }

    const toc = buildTableOfContents(loreEntries, mediaEntries);

    // 2. Call Haiku with a real HTTP-level timeout. The tracked wrapper
    //    forwards RequestOptions to the SDK, so an AbortSignal aborts
    //    the actual fetch — we stop billing for tokens we're not going
    //    to consume. The outer catch still handles `err.name === "AbortError"`
    //    the same way as before.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), SELECTION_TIMEOUT_MS);
    let response: Anthropic.Message;
    try {
      response = await trackedMessagesCreate(
        getSelectionClient(),
        {
          userId: opts.userId ?? null,
          operation: "context.select",
          conversationId: opts.conversationId ?? null,
        },
        {
          model: SELECTION_MODEL,
          max_tokens: SELECTION_MAX_TOKENS,
          temperature: 0,
          system: SELECTION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `User message: "${userMessage}"\n\nTable of contents:\n${toc}`,
            },
          ],
        },
        { signal: abort.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    // 3. Parse the JSON response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return empty;

    const raw = textBlock.text.trim();
    // Extract JSON from potential markdown fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[select-context] no JSON found in Haiku response:", raw);
      return empty;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      loreIds?: unknown;
      mediaIds?: unknown;
    };

    // 4. Validate IDs against the TOC (discard hallucinated ones)
    const validLoreIds = new Set(loreEntries.map((e) => e.id));
    const validMediaIds = new Set(mediaEntries.map((e) => e.id));

    const loreIds = (
      Array.isArray(parsed.loreIds) ? parsed.loreIds : []
    )
      .filter((id): id is string => typeof id === "string" && validLoreIds.has(id))
      .slice(0, MAX_SELECTED_LORE);

    const mediaIds = (
      Array.isArray(parsed.mediaIds) ? parsed.mediaIds : []
    )
      .filter(
        (id): id is string => typeof id === "string" && validMediaIds.has(id),
      )
      .slice(0, MAX_SELECTED_MEDIA);

    return { loreIds, mediaIds };
  } catch (err) {
    // Graceful degradation: any failure → empty selection. The agent
    // still gets canon + member facts + relationships + calendar.
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn("[select-context] Haiku call timed out after 2s");
    } else {
      console.error("[select-context] selection failed:", err);
    }
    return empty;
  }
}
