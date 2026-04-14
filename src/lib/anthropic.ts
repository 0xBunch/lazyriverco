import Anthropic from "@anthropic-ai/sdk";

export const MODEL_HAIKU = "claude-haiku-4-5-20251001" as const;

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

export const anthropic = new Anthropic({ apiKey });
