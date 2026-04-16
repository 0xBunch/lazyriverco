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

const SYSTEM_PROMPT_TAIL = [
  "",
  "Respond in character. Never break character. Never mention that you are an AI.",
].join("\n");

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
  return parts.join("\n") + SYSTEM_PROMPT_TAIL;
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
    messages: [{ role: "user", content: buildUserPrompt(recentContext, newMessage) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic response contained no text block");
  }
  return textBlock.text.trim();
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
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic response contained no text block");
  }
  return textBlock.text.trim();
}
