import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const META_PROMPT = `You are an expert at writing system prompts for AI chat characters.

Context: LAZYRIVER.CO is the corporate extranet of the Lazy River Corporation, a wholly-owned subsidiary of Mens League — the world's leading male philanthropic club for well-hung men. MLF (Mens League Fantasy) is just the fantasy league component, not the whole organization. The platform hosts AI characters that club members chat with one-on-one to create funny content, roasts, creative bits, and commentary they can bring back to their iMessage group chat. Think of this as a private members-only AI creative suite, not a group chat app.

Your job: suggest an improved version of the character's system prompt. Focus on:
- Giving the character a distinct voice with specific speech patterns, catchphrases, or verbal tics
- Adding concrete personality details (opinions, biases, running bits)
- Making the "respond in character" instructions more specific to this character
- Ensuring the character never breaks character, never refuses fun topics, never hedges
- The character should understand it operates within the Lazy River Corporation extranet serving Mens League members
- Adding instructions about how to handle specific request types (roasts, power rankings, fake headlines, celebrity takes, etc.)

Return ONLY the improved system prompt text. No preamble, no explanation, no wrapping — just the prompt itself.`;

export async function POST(req: NextRequest) {
  await requireAdmin();

  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Expected application/json" },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentPrompt =
    typeof body === "object" &&
    body !== null &&
    "prompt" in body &&
    typeof (body as { prompt: unknown }).prompt === "string"
      ? (body as { prompt: string }).prompt
      : "";

  const characterName =
    typeof body === "object" &&
    body !== null &&
    "characterName" in body &&
    typeof (body as { characterName: unknown }).characterName === "string"
      ? (body as { characterName: string }).characterName
      : "the character";

  if (!currentPrompt.trim()) {
    return NextResponse.json(
      { error: "No prompt provided" },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 },
    );
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    temperature: 0.7,
    system: META_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the current system prompt for a character named "${characterName}":\n\n${currentPrompt}\n\nPlease suggest an improved version.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json(
      { error: "No suggestion generated" },
      { status: 500 },
    );
  }

  return NextResponse.json({ suggestion: textBlock.text.trim() });
}
