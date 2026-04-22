import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { trackedMessagesCreate } from "@/lib/usage";

// Player partner ("WAG") lookup — Claude + Anthropic's built-in web_search
// tool. Lazily populates PlayerPartnerInfo on first profile view; subsequent
// views hit the indexed DB row. The row is always written after the first
// lookup (including when no partner is found) so we don't re-hit Anthropic
// on every page load for obscure backups.
//
// Design:
//   - In-flight lock map by playerId (same pattern as sleeper-ai takes)
//     so a refresh-mid-load double-click can't fan out two Claude calls.
//   - JSON extraction mirrors the classify-tag-bucket.ts approach:
//     system prompt commands JSON-only output, post-parse via regex,
//     defensive narrowing on every field before writing.
//   - Image URL whitelist at WRITE time — we only store URLs from hosts
//     whose hotlink policy is either permissive (Wikimedia) or at least
//     browser-tolerable; unknown hosts are dropped to null so the card
//     falls back to initials rather than rendering a broken image.
//   - Kill switch via SLEEPER_PARTNERS_ENABLED env — default off so
//     deploys are safe until ops explicitly flips it.

const PARTNER_MODEL = "claude-haiku-4-5-20251001";
const PARTNER_MAX_TOKENS = 600;
// Single timeout; the API route awaits this directly rather than wrapping
// it in a second Promise.race so we don't end up with two timing mechanisms
// fighting each other.
const PARTNER_TIMEOUT_MS = 12_000;
const MAX_WEB_SEARCHES = 2; // cap the server-side web_search tool

// Whitelisted image hosts — Wikimedia only. We considered CDN fallbacks
// (Instagram scontent.*.cdninstagram.com, Getty media.gettyimages.com)
// but security-sentinel flagged a real risk: those are open user-content
// CDNs, so an attacker who seeds a page ranking for a player's name can
// get Claude to pick an attacker-uploaded image. Wikimedia is moderated +
// stable + permissively licensed. On players without a Wikipedia partner
// page the card falls back to initials, which is the correct behavior.
const IMAGE_HOST_WHITELIST = new Set([
  "upload.wikimedia.org",
  "commons.wikimedia.org",
]);

// Whitelist of reputable sources we'll render as a clickable "source" link
// on the card. A plain protocol check isn't enough — Claude pulls live web
// content, so an attacker-controlled domain could land in sourceUrl via
// prompt injection and phish members from our origin's trust context.
// Matched by eTLD+1 suffix so subdomains of allowed sites pass.
const SOURCE_DOMAIN_WHITELIST = [
  "wikipedia.org",
  "wikimedia.org",
  "espn.com",
  "nfl.com",
  "si.com",
  "sportsillustrated.com",
  "yahoo.com",
  "nytimes.com",
  "washingtonpost.com",
  "theathletic.com",
  "people.com",
  "usatoday.com",
  "foxsports.com",
  "cbssports.com",
  "bleacherreport.com",
  "usmagazine.com",
];

export function isPartnersEnabled(): boolean {
  return process.env.SLEEPER_PARTNERS_ENABLED?.toLowerCase().trim() === "true";
}

export type PartnerRelationship =
  | "wife"
  | "fiancee"
  | "girlfriend"
  | "partner"
  | "not_found";

export type PartnerRow = {
  playerId: string;
  name: string | null;
  relationship: PartnerRelationship;
  notableFact: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  confidence: "low" | "medium" | "high";
  checkedAt: string;
};

// Anthropic-managed server-side web search. Same shape the main chat path
// uses in src/lib/anthropic.ts — re-declared here so this module stays
// import-clean from the chat hot path.
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: MAX_WEB_SEARCHES,
} as const;

let _client: Anthropic | null = null;
async function getClient(): Promise<Anthropic> {
  if (_client) return _client;
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("<")) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  _client = new AnthropicSDK({ apiKey });
  return _client;
}

function toPartnerRow(r: {
  playerId: string;
  name: string | null;
  relationship: string;
  notableFact: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  confidence: string;
  checkedAt: Date;
}): PartnerRow {
  return {
    playerId: r.playerId,
    name: r.name,
    relationship: narrowRelationship(r.relationship),
    notableFact: r.notableFact,
    imageUrl: r.imageUrl,
    sourceUrl: r.sourceUrl,
    confidence: narrowConfidence(r.confidence),
    checkedAt: r.checkedAt.toISOString(),
  };
}

function narrowRelationship(raw: string): PartnerRelationship {
  switch (raw) {
    case "wife":
    case "fiancee":
    case "girlfriend":
    case "partner":
    case "not_found":
      return raw;
    default:
      return "not_found";
  }
}

function narrowConfidence(raw: string): "low" | "medium" | "high" {
  return raw === "medium" || raw === "high" ? raw : "low";
}

/** Read-only cache lookup. Returns null when there's no row yet. */
export async function getPlayerPartner(
  playerId: string,
): Promise<PartnerRow | null> {
  const row = await prisma.playerPartnerInfo.findUnique({
    where: { playerId },
  });
  return row ? toPartnerRow(row) : null;
}

const partnerInFlight = new Map<string, Promise<PartnerRow | null>>();

/** Lazy generator. Returns the existing row if cached. Otherwise calls
 *  Claude (with web_search) to extract structured info, validates +
 *  persists, returns the resulting row. Single-flight per playerId. */
export function generatePlayerPartner(
  playerId: string,
): Promise<PartnerRow | null> {
  const existing = partnerInFlight.get(playerId);
  if (existing) return existing;
  const promise = runGenerate(playerId).finally(() => {
    partnerInFlight.delete(playerId);
  });
  partnerInFlight.set(playerId, promise);
  return promise;
}

async function runGenerate(playerId: string): Promise<PartnerRow | null> {
  if (!isPartnersEnabled()) return null;

  const cached = await getPlayerPartner(playerId);
  if (cached) return cached;

  const player = await prisma.sleeperPlayer.findUnique({
    where: { playerId },
    select: {
      playerId: true,
      fullName: true,
      firstName: true,
      lastName: true,
      position: true,
      team: true,
      active: true,
    },
  });
  if (!player) return null;

  const fullName =
    player.fullName ??
    [player.firstName, player.lastName].filter(Boolean).join(" ").trim();
  if (!fullName) return null;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(fullName, player.position, player.team);

  let reply: Anthropic.Messages.Message;
  try {
    const client = await getClient();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), PARTNER_TIMEOUT_MS);
    try {
      reply = await trackedMessagesCreate(
        client,
        {
          // Tagged as context.select so the Claude call attributes to the
          // narrow "background metadata lookup" usage bucket rather than
          // the chat path. Keeps /admin/usage honest about what's driving
          // spend.
          userId: null,
          operation: "context.select",
          conversationId: null,
          characterId: null,
        },
        {
          model: PARTNER_MODEL,
          max_tokens: PARTNER_MAX_TOKENS,
          temperature: 0.2,
          system: systemPrompt,
          tools: [WEB_SEARCH_TOOL],
          messages: [{ role: "user", content: userPrompt }],
        },
        { signal: abort.signal },
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(
      `[player-partner] Claude call failed for ${playerId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const extracted = extractJson(reply.content);
  const validated = validate(extracted);

  const writeRow = {
    playerId,
    name: validated.name,
    relationship: validated.relationship,
    notableFact: validated.notableFact,
    imageUrl: validated.imageUrl,
    sourceUrl: validated.sourceUrl,
    confidence: validated.confidence,
  };

  try {
    const row = await prisma.playerPartnerInfo.upsert({
      where: { playerId },
      create: writeRow,
      update: { ...writeRow, checkedAt: new Date() },
    });
    return toPartnerRow(row);
  } catch (err) {
    console.warn("[player-partner] persist failed:", err);
    return null;
  }
}

function buildSystemPrompt(): string {
  return [
    "You are a lookup assistant that finds the current, publicly-known romantic partner of an NFL player and returns a strict JSON object. No prose, no markdown fences, no commentary — only JSON.",
    "",
    "You MAY call the web_search tool up to twice to confirm. Prefer Wikipedia pages when available; fall back to reputable outlets (ESPN, major newspapers, official team sites).",
    "",
    "Rules:",
    "- If the player has a publicly-known wife, fiancée, or long-term girlfriend and you can find a reliable source, fill every field.",
    "- If you cannot find any reliable source, return relationship: \"not_found\" with name: null. Do NOT guess.",
    "- NEVER invent a partner. NEVER surface rumored, unverified, or tabloid-only relationships.",
    "- Keep notableFact to one short public-facing fact (career, sport, public profile). No private details, no physical descriptions, no speculation.",
    "- imageUrl must be a direct-hotlinkable image URL from the partner's Wikipedia page or a reputable outlet. Omit (null) if unsure.",
    "- sourceUrl must be the web page that verifies the relationship.",
    "- confidence: \"high\" only when Wikipedia or an official source explicitly states the relationship; \"medium\" for reputable outlets; \"low\" otherwise.",
    "",
    "Output shape (all fields required, nullable where noted):",
    "{",
    "  \"name\": string | null,",
    "  \"relationship\": \"wife\" | \"fiancee\" | \"girlfriend\" | \"partner\" | \"not_found\",",
    "  \"notableFact\": string | null,",
    "  \"imageUrl\": string | null,",
    "  \"sourceUrl\": string | null,",
    "  \"confidence\": \"low\" | \"medium\" | \"high\"",
    "}",
    "",
    "Output ONLY the JSON object. No markdown fences. No text before or after.",
  ].join("\n");
}

function buildUserPrompt(
  fullName: string,
  position: string | null,
  team: string | null,
): string {
  const context = [
    `NFL player: ${fullName}`,
    position ? `Position: ${position}` : null,
    team ? `Team: ${team}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${context}\n\nLook up this player's current, publicly-known partner and return the JSON object per the system instructions.`;
}

function extractJson(
  content: readonly Anthropic.Messages.ContentBlock[],
): unknown {
  const text = content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) return null;
  // Strip code fences defensively even though we told Claude not to emit them.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

type Validated = {
  name: string | null;
  relationship: PartnerRelationship;
  notableFact: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  confidence: "low" | "medium" | "high";
};

function validate(raw: unknown): Validated {
  const fallback: Validated = {
    name: null,
    relationship: "not_found",
    notableFact: null,
    imageUrl: null,
    sourceUrl: null,
    confidence: "low",
  };
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;

  const relationship = narrowRelationship(
    typeof o.relationship === "string" ? o.relationship : "not_found",
  );
  // When not_found, throw away any name Claude might have hallucinated.
  const name =
    relationship === "not_found"
      ? null
      : typeof o.name === "string" && o.name.trim().length > 0
        ? clip(o.name.trim(), 80)
        : null;
  const notableFact =
    typeof o.notableFact === "string" && o.notableFact.trim().length > 0
      ? clip(o.notableFact.trim(), 240)
      : null;
  const sourceUrl =
    typeof o.sourceUrl === "string" ? sanitizeHttpUrl(o.sourceUrl) : null;
  const imageUrl =
    typeof o.imageUrl === "string" ? sanitizeImageUrl(o.imageUrl) : null;
  const confidence = narrowConfidence(
    typeof o.confidence === "string" ? o.confidence : "low",
  );

  return { name, relationship, notableFact, imageUrl, sourceUrl, confidence };
}

function clip(s: string, max: number): string {
  // Strip C0 control characters (\x00-\x1f, \x7f), zero-width codepoints,
  // bidi overrides, and other rendering-manipulation characters before
  // clipping. Claude pulls live web content; without this a seeded page
  // could pipe zero-width-joined phishing text into a DB field that
  // renders to every member's profile page.
  const cleaned = s
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}

function sanitizeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null; // drop userinfo phishing vectors
    if (raw.length > 512) return null;
    const host = u.hostname.toLowerCase();
    const onList = SOURCE_DOMAIN_WHITELIST.some(
      (d) => host === d || host.endsWith("." + d),
    );
    if (!onList) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function sanitizeImageUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (raw.length > 1024) return null;
    // Whitelist check — if the host isn't on the list we drop the URL so the
    // UI falls back to initials rather than rendering attacker-controlled
    // bytes from an open-CDN host.
    if (!IMAGE_HOST_WHITELIST.has(u.hostname.toLowerCase())) return null;
    // Last line of defense: require a real image extension. Stops Claude
    // from mis-labeling an HTML page as an image URL.
    const path = u.pathname.toLowerCase();
    if (!/\.(jpe?g|png|webp|gif|avif)(\?|$)/.test(path)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
