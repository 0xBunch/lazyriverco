import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const META_PROMPT = `You are an expert at writing system prompts for AI chat characters.

The user will give you a system prompt for a character in a private men's league group chat app called The Lazy River Co. These characters chat with users one-on-one to help them create funny content, roasts, fantasy sports commentary, and creative bits they can share in their iMessage group chat.

Your job: suggest an improved version of the prompt that makes the character more vivid, engaging, and effective. Focus on:
- Giving the character a distinct voice with specific speech patterns, catchphrases, or verbal tics
- Adding concrete personality details (opinions, biases, running bits)
- Making the "respond in character" instructions more specific to this character
- Ensuring the character never breaks character or refuses fun topics
- Adding instructions about how to handle specific request types (roasts, power rankings, fake headlines, etc.)

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
