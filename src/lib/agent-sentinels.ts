// Closed registry for server-side parsing of agent handoff sentinels.
//
// Default-agent characters (e.g. Moises) emit a machine-readable tag at
// the end of replies when they want to suggest a specialist handoff:
//
//   <suggest-agent name="joey-barfdog" reason="Joey lives for this stuff">
//
// The conversation orchestrator calls parseSentinel after generating the
// raw model output. parseSentinel strips the tag from the content that
// gets persisted + rendered, validates the name against the active
// Character allowlist, sanitizes the reason, and returns a structured
// suggestion. The chat DTO layer attaches it to CHARACTER-authored
// messages so the client can render an AgentSuggestionButton below the
// bubble without doing any parsing of its own.
//
// Deliberate friction: adding a new sentinel requires touching THIS
// module — grep for callers (`parseSentinel`, `SENTINEL_REGEX`) to see
// the full set. When phase 2 adopts real Anthropic tool-use, swap
// parseSentinel for a tool_use block handler and delete this module.
//
// Security notes (security-sentinel review, 2026-04-15):
//   - parseSentinel MUST only be called on CHARACTER-authored messages.
//     User content is never parsed, so a member can't type a fake
//     sentinel into their composer and render a spoofed CTA.
//   - `name` is validated against the known-character allowlist before
//     a suggestion is returned, preventing prompt-injection-induced
//     handoffs to non-existent or deactivated slugs.
//   - `reason` is stripped of control chars, collapsed whitespace, and
//     capped at MAX_REASON_CHARS. The client renders it as a React text
//     child only — never dangerouslySetInnerHTML, never an href/src.

// Matches (case-insensitive):
//
//   <suggest-agent name="slug-name" reason="short text">
//
// Self-closing variant (<suggest-agent ... />) tolerated. Whitespace
// inside the tag is flexible. Attribute values are double-quoted; `name`
// is a lowercase slug (letters/digits/hyphen); `reason` is 1..120 chars
// of any non-double-quote content. Attribute order is fixed: name first,
// then reason.
const SENTINEL_REGEX =
  /<\s*suggest-agent\s+name\s*=\s*"([a-z0-9][a-z0-9-]*)"\s+reason\s*=\s*"([^"]{1,120})"\s*\/?\s*>/i;

const MAX_REASON_CHARS = 120;

// Allow-list of sentinel verbs this module knows how to handle. Phase 1
// ships one. New entries go here first, parser branches go below.
const KNOWN_SENTINEL_NAMES = ["suggest-agent"] as const;
export type KnownSentinelName = (typeof KNOWN_SENTINEL_NAMES)[number];

export type SentinelSuggestion = {
  characterName: string;
  reason: string;
};

export type ParseSentinelResult = {
  /** Message content with the sentinel tag stripped (or original, if no match). */
  cleaned: string;
  /** Structured suggestion iff the sentinel matched a known, allow-listed character. */
  suggestion: SentinelSuggestion | null;
};

/**
 * Parse a CHARACTER-authored message for a <suggest-agent> handoff.
 *
 * The caller MUST ensure the message's authorType is "CHARACTER" before
 * calling. Parsing user content would let members spoof handoff CTAs in
 * their own messages.
 *
 * @param content - The raw message body.
 * @param knownCharacterNames - Active `Character.name` slugs. Suggestions
 *   targeting a name not in this list are dropped (the tag is still
 *   stripped from the cleaned content — we never render a raw sentinel
 *   tag even if we drop the suggestion).
 */
export function parseSentinel(
  content: string,
  knownCharacterNames: readonly string[],
): ParseSentinelResult {
  const match = content.match(SENTINEL_REGEX);
  if (!match) return { cleaned: content, suggestion: null };

  const rawName = match[1]!.toLowerCase();
  const rawReason = match[2]!;

  // Always strip the tag from the visible content regardless of
  // validation outcome — the raw sentinel must never reach the client.
  const cleaned = content.replace(SENTINEL_REGEX, "").trim();

  // Validate `name` against the active character allow-list. Dropping
  // the suggestion (but still stripping the tag) ensures a prompt-
  // injected sentinel can't trick the UI into rendering a CTA for a
  // non-existent or deactivated character.
  const lowered = new Set(knownCharacterNames.map((n) => n.toLowerCase()));
  if (!lowered.has(rawName)) {
    return { cleaned, suggestion: null };
  }

  // Reason hygiene: strip control chars + collapse whitespace + cap.
  // eslint-disable-next-line no-control-regex
  const reason = rawReason
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REASON_CHARS);

  if (reason.length === 0) {
    return { cleaned, suggestion: null };
  }

  return {
    cleaned,
    suggestion: { characterName: rawName, reason },
  };
}

export { KNOWN_SENTINEL_NAMES, MAX_REASON_CHARS, SENTINEL_REGEX };
