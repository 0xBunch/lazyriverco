import Anthropic from "@anthropic-ai/sdk";

// Haiku 4.5 alias — resolves to the latest snapshot server-side. Verified via
// Anthropic's TS SDK docs this session (`/anthropics/anthropic-sdk-typescript`
// uses the same alias form in its messages.create example). Using the alias
// instead of a pinned snapshot keeps us resilient to Anthropic's versioning.
export const MODEL_HAIKU = "claude-haiku-4-5" as const;

// Lazy singleton — constructing the client at module load would make every
// import of this file (including Next's build-time page data collection)
// require a valid API key. We only care about the key at call time.
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
  "Respond in character. Keep it to 1-3 short sentences. You are texting in a group chat — be punchy, not verbose. Never break character. Never mention that you are an AI.",
].join("\n");

export type ChatContextLine = {
  displayName: string;
  content: string;
};

/**
 * Build a formatted transcript for the character prompt. Each line is
 * `[DisplayName]: content`, oldest first. The final line is the message
 * the character is reacting to.
 */
function formatChatContext(lines: readonly ChatContextLine[]): string {
  return lines.map((l) => `[${l.displayName}]: ${l.content}`).join("\n");
}

/**
 * Generate a single character response from Claude. Throws on API errors —
 * the orchestrator decides whether to catch, retry, or drop.
 */
export async function generateCharacterResponse(
  systemPrompt: string,
  recentContext: readonly ChatContextLine[],
  newMessage: ChatContextLine,
): Promise<string> {
  const transcript = formatChatContext([...recentContext, newMessage]);
  const userPrompt = [
    "Here is the recent group chat, oldest first. Reply to the most recent",
    "message in your own voice. Output ONLY the reply text — no prefixes,",
    "no quoting, no meta commentary.",
    "",
    transcript,
  ].join("\n");

  const response = await getClient().messages.create({
    model: MODEL_HAIKU,
    max_tokens: 200,
    temperature: 0.9,
    system: `${systemPrompt}${SYSTEM_PROMPT_TAIL}`,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic response contained no text block");
  }
  return textBlock.text.trim();
}
