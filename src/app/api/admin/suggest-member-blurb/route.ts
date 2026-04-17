import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const META_PROMPT = `You are helping an admin write a short member blurb for LAZYRIVER.CO, the corporate extranet of the Lazy River Corporation (a wholly-owned subsidiary of Mens League — the world's leading male philanthropic club for well-hung men). MLF (Mens League Fantasy) is the club's fantasy football league.

The blurb describes a REAL club member (not an AI character). It gets injected verbatim into every AI agent's prompt so the agents know who this person is and can reference them naturally — their city, team, running bits, relationships with other members, speech habits, ongoing drama.

Your job: take the admin's draft blurb and suggest an improved version. Focus on:
- Third-person prose about a real person — not a persona or voice assignment
- Concrete, specific details (running jokes, grudges, habits, relationships to other members) over generic traits
- Short and dense — ideally 2-5 sentences, no fluff, no marketing speak
- Nothing the agents should "act out" — just facts and color they can reference
- Keep every factual claim the admin included; only sharpen, compress, and add color where the draft is vague
- Do not invent biographical facts the admin didn't supply (cities, jobs, family) — you can sharpen running-bits language but not fabricate history

Return ONLY the improved blurb text. No preamble, no explanation, no quotes wrapping it — just the blurb itself.`;

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

  const asRecord = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  const fields = asRecord(body);
  const getString = (key: string): string =>
    typeof fields[key] === "string" ? (fields[key] as string) : "";

  const currentBlurb = getString("prompt");
  const displayName = getString("displayName") || "this member";
  const memberName = getString("memberName");
  const city = getString("city");
  const favoriteTeam = getString("favoriteTeam");

  if (!currentBlurb.trim()) {
    return NextResponse.json(
      { error: "Write a draft blurb first." },
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

  const structured = [
    memberName ? `Handle: @${memberName}` : null,
    city ? `City: ${city}` : null,
    favoriteTeam ? `Favorite team: ${favoriteTeam}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = [
    `Member: ${displayName}`,
    structured,
    "",
    "Current blurb draft:",
    currentBlurb,
    "",
    "Please suggest an improved version.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    temperature: 0.7,
    system: META_PROMPT,
    messages: [{ role: "user", content: userContent }],
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
