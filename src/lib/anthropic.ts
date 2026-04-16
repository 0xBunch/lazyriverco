import Anthropic from "@anthropic-ai/sdk";

// Sonnet 4.6 — the latest and most capable Sonnet. Now that streaming
// is wired, the 10-20s generation time is invisible to the user because
// tokens flow in at ~1s TTFB. Verified model ID against Anthropic docs:
// "claude-sonnet-4-6" is the alias for the current Sonnet family.
export const CHAT_MODEL = "claude-sonnet-4-6" as const;

const MAX_TOKENS = 1500;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("<")) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add a real key to .env.local",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// Server-side web_search tool. Anthropic runs the search and feeds results
// back to the model transparently — no client-side tool loop needed. The
// model decides when to invoke it. Adds ~3-8s latency on turns that search,
// none on turns that don't. Tool spec verified against
// @anthropic-ai/sdk 0.89 docs (web_search_20250305).
//
// max_uses caps searches per single turn — cheap insurance against a
// pathological case where the model chains many searches on one message.
// Most turns use 0 or 1 searches, so this doesn't change normal behavior.
// At Anthropic's $10/1k searches, 3 caps a single runaway turn at $0.03.
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
} as const;

// Built fresh per call so the date is accurate. The worldliness paragraph
// unlocks the model's existing knowledge of public figures / current events
// for in-character riffing — without it personas tend to dodge ("I have no
// idea who that is") when asked about real people they actually know about
// from training. The web_search nudge tells them to reach for the tool when
// genuinely stale.
function buildSystemPromptTail(): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [
    "",
    `Today is ${today}.`,
    "",
    "You exist in the real world and are aware of public figures, current",
    "events, news, sports, politics, and pop culture from your training. Riff",
    "on real people and events from your own POV — never dodge with 'I don't",
    "know who that is' if it's someone reasonably well-known. If you genuinely",
    "need fresh or recent info (breaking news, live scores, anything past your",
    "training), use the web_search tool. Apply your persona's voice and",
    "opinions to whatever you find.",
    "",
    "Respond in character. Never break character. Never mention that you are an AI.",
  ].join("\n");
}

export type ChatContextLine = {
  displayName: string;
  content: string;
};

function formatChatContext(lines: readonly ChatContextLine[]): string {
  return lines.map((l) => `[${l.displayName}]: ${l.content}`).join("\n");
}

function composeSystemPrompt(
  bible: string,
  richContext: string | null,
): string {
  const parts: string[] = [bible];
  if (richContext && richContext.trim()) {
    parts.push("");
    parts.push(richContext);
  }
  return parts.join("\n") + buildSystemPromptTail();
}

/**
 * Concatenate every text block in a Messages response, trimmed. Throws
 * when the response has no text content. Web_search responses interleave
 * `text` with `server_tool_use` / `web_search_tool_result` blocks, so
 * picking "the first text block" drops content — we join in order instead.
 */
function extractText(
  content: readonly Anthropic.Messages.ContentBlock[],
): string {
  const text = content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) {
    throw new Error("Anthropic response contained no text block");
  }
  return text;
}

function buildUserPrompt(
  recentContext: readonly ChatContextLine[],
  newMessage: ChatContextLine,
): string {
  const transcript = formatChatContext([...recentContext, newMessage]);
  return [
    "Here is the recent conversation, oldest first. Reply to the most recent",
    "message in your own voice. Output ONLY the reply text — no prefixes,",
    "no quoting, no meta commentary.",
    "",
    transcript,
  ].join("\n");
}

/**
 * One-shot (non-streaming) character response. Used by:
 *   - runOrchestrator (legacy channel path)
 *   - runConversationOrchestrator (fire-and-forget on initial conversation create)
 *   - generateDraftCommentary
 */
export async function generateCharacterResponse(
  systemPrompt: string,
  recentContext: readonly ChatContextLine[],
  newMessage: ChatContextLine,
  richContext: string | null = null,
): Promise<string> {
  const response = await getClient().messages.create({
    model: CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.9,
    system: composeSystemPrompt(systemPrompt, richContext),
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: "user", content: buildUserPrompt(recentContext, newMessage) }],
  });

  return extractText(response.content);
}

/**
 * Streaming character response with callback. Fires `onDelta` for each
 * text chunk as it arrives from the Anthropic API. Returns the full
 * accumulated reply text when the stream completes. Used by the SSE
 * stream endpoint (POST /api/conversations/[id]/stream) to pipe tokens
 * to the client in real time.
 *
 * Uses `stream.on("text")` rather than the async-iterable `.textStream`
 * property, which isn't available in SDK 0.89.0.
 */
export async function streamCharacterResponse(
  systemPrompt: string,
  recentContext: readonly ChatContextLine[],
  newMessage: ChatContextLine,
  richContext: string | null = null,
  onDelta: (delta: string) => void = () => {},
): Promise<string> {
  const stream = getClient().messages.stream({
    model: CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.9,
    system: composeSystemPrompt(systemPrompt, richContext),
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: "user", content: buildUserPrompt(recentContext, newMessage) }],
  });

  let fullText = "";
  stream.on("text", (delta) => {
    fullText += delta;
    onDelta(delta);
  });

  await stream.finalMessage();
  return fullText;
}

export type DraftPick = {
  playerName: string;
  position: string;
  team: string;
  round: number;
};

export async function generateDraftCommentary(
  systemPrompt: string,
  pick: DraftPick,
  richContext: string | null = null,
): Promise<string> {
  const userPrompt = [
    `You just drafted ${pick.playerName}, ${pick.position} from the ${pick.team},`,
    `in round ${pick.round} of your fantasy draft. Announce your pick to the group chat.`,
    "Be extremely confident. Explain why this is a genius pick. Make a bold",
    "prediction about their season. Remember, you think all your picks are",
    "brilliant even though they're terrible.",
    "",
    "Output ONLY the announcement text — no prefixes, no quoting, no meta commentary.",
  ].join("\n");

  const response = await getClient().messages.create({
    model: CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.9,
    system: composeSystemPrompt(systemPrompt, richContext),
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: "user", content: userPrompt }],
  });

  return extractText(response.content);
}
