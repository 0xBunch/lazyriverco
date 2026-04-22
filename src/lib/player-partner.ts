import "server-only";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { trackedGeminiCall } from "@/lib/usage";

// Player partner ("WAG") lookup — Gemini 2.5 Flash with Google Search
// grounding. Lazily populates PlayerPartnerInfo on first profile view;
// subsequent views hit the indexed DB row. The row is always written
// after the first lookup (including when no partner is found) so we
// don't re-hit Gemini on every page load for obscure backups.
//
// Why Gemini + Google Search over Claude + web_search:
//   - Google Search grounding returns richer result cards including
//     image URLs directly (Claude's web_search returns text summaries).
//   - Cheaper per call at Flash prices.
//   - Existing repo infra: GOOGLE_GENAI_API_KEY + trackedGeminiCall
//     wrapper are already wired for the library auto-tagging feature.
//   - Claude's RLHF is noticeably more reluctant to surface the
//     romantic partner of a public figure; Gemini is more willing to
//     name and cite.
//
// Design:
//   - In-flight lock map by playerId (same pattern as sleeper-ai takes)
//     so a refresh-mid-load double-click can't fan out two Gemini calls.
//   - JSON extraction: Gemini + tools can't co-use responseSchema, so
//     we command JSON-only output in the system instruction and parse
//     via the same regex approach classify-tag-bucket.ts uses.
//   - Image URLs: HTTPS + real image extension gate here; the actual
//     bytes get re-served via /api/sleeper/players/[id]/partner/image
//     so cross-origin hotlink blockers don't apply at render time.
//   - Kill switch via SLEEPER_PARTNERS_ENABLED env — default off so
//     deploys are safe until ops explicitly flips it.

const PARTNER_MODEL = "gemini-2.5-flash";
// Single timeout owned by this module; the API route awaits directly
// rather than wrapping in a second Promise.race.
const PARTNER_TIMEOUT_MS = 14_000;

// Per KB direction: coverage matters more than origin-whitelist purity
// for this private 7-user app. We accept image URLs from any HTTPS host,
// then proxy-fetch them server-side (see /api/sleeper/players/[id]/partner/image)
// so the browser never makes a cross-origin request. Proxy enforces
// content-type + size limits at fetch time as the real protection.
// Extension gate on the URL below catches Claude hallucinating HTML as
// an image — that's the one check we keep.

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

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENAI_API_KEY is not set");
  _client = new GoogleGenAI({ apiKey });
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

  const systemInstruction = buildSystemPrompt();
  const userPrompt = buildUserPrompt(fullName, player.position, player.team);

  let replyText = "";
  try {
    const client = getClient();
    const response = await withTimeout(
      trackedGeminiCall(
        {
          userId: null,
          // Attribute to media.analyze so /admin/usage surfaces this
          // alongside the other Gemini-backed background lookups.
          operation: "media.analyze",
          model: PARTNER_MODEL,
        },
        () =>
          client.models.generateContent({
            model: PARTNER_MODEL,
            config: {
              systemInstruction,
              temperature: 0.2,
              // Google Search grounding — returns search cards + URLs the
              // model has already chewed on. Can't combine with
              // responseSchema / responseMimeType:"application/json", so
              // we parse JSON out of plain text below (same approach as
              // classify-tag-bucket.ts).
              tools: [{ googleSearch: {} }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }],
              },
            ],
          }),
      ),
      PARTNER_TIMEOUT_MS,
    );
    replyText = response.text ?? "";
  } catch (err) {
    console.warn(
      `[player-partner] Gemini call failed for ${playerId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const extracted = extractJsonText(replyText);
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
    "You MAY call the web_search tool up to twice. Search broadly: Wikipedia, ESPN, People, US Weekly, team sites, Instagram profile mentions, sports news outlets, anything the web surfaces. Whichever source is clearest wins.",
    "",
    "Rules:",
    "- If the player has a publicly-known wife, fiancée, long-term girlfriend, or partner and you can find a reliable source, fill every field.",
    "- If you cannot find any reliable source, return relationship: \"not_found\" with name: null. Do NOT guess.",
    "- NEVER invent a partner. NEVER surface rumored or unverified relationships — only ones that named outlets have reported on.",
    "- Keep notableFact to one short public-facing fact (career, achievement, public profile). No private details, no speculation.",
    "- imageUrl: pick the clearest direct-image URL from the web results. Must END IN a real image extension (.jpg, .jpeg, .png, .webp, .gif, .avif — query strings OK after). Photos of the partner alone are best; couple photos are fine as a fallback. Skip it (null) only if you truly can't find a photo.",
    "- sourceUrl must be the web page that verifies the relationship.",
    "- confidence: \"high\" when Wikipedia or an official source explicitly states the relationship; \"medium\" for reputable outlets; \"low\" otherwise.",
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

function extractJsonText(raw: string): unknown {
  const text = raw.trim();
  if (!text) return null;
  // Strip code fences defensively even though we told Gemini not to emit them.
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

// Generic timeout race for Gemini's generateContent (which doesn't take
// an AbortSignal the way the Anthropic SDK does). Matches the pattern
// used by src/lib/ai-tagging.ts.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`gemini-partner timeout after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
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
    if (raw.length > 2048) return null;
    // Require a real image extension. Stops Claude from mis-labeling an
    // HTML page URL as an image; also filters out the tracking-pixel
    // nonsense you sometimes get in wire-service photo pages.
    const path = u.pathname.toLowerCase();
    if (!/\.(jpe?g|png|webp|gif|avif)(\?|$)/.test(path)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
