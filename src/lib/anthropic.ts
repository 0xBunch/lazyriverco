import Anthropic from "@anthropic-ai/sdk";

// Haiku 4.5 with a generous token budget. Haiku is fast enough for
// responsive chat (~3-5s replies) while 800 tokens lets it write
// full creative responses instead of the clipped 2-sentence output
// the original 200-token cap produced.
//
// When streaming (phase 2) is wired, swap to "claude-sonnet-4-6" —
// Sonnet is dramatically better for creative work but too slow
// without token-by-token rendering (10-20s wall time feels dead).
export const CHAT_MODEL = "claude-haiku-4-5" as const;

const MAX_TOKENS = 800;

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

export async function generateCharacterResponse(
  systemPrompt: string,
  recentContext: readonly ChatContextLine[],
  newMessage: ChatContextLine,
  richContext: string | null = null,
): Promise<string> {
  const transcript = formatChatContext([...recentContext, newMessage]);
  const userPrompt = [
    "Here is the recent conversation, oldest first. Reply to the most recent",
    "message in your own voice. Output ONLY the reply text — no prefixes,",
    "no quoting, no meta commentary.",
    "",
    transcript,
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
