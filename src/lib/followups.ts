// Follow-up suggestion extraction for dialogue-mode agents.
//
// Agents with Character.dialogueMode=true may end a reply with a block
// like:
//
//   <followups>
//   how does this compare to last year?
//   who else has done this well?
//   can you show me an example?
//   </followups>
//
// The stream route pulls this block out BEFORE persisting the message so
// the raw tag never reaches the DB or the client's scroll-back. The
// suggestions become an SSE `followups` event; the frontend renders them
// as clickable chips attached to the just-streamed agent message.
//
// Emission is the model's judgment — self-contained replies should omit
// the tag entirely. The parser here is tolerant of missing/malformed
// blocks: absent tag → no suggestions, empty block → no suggestions,
// more than 3 lines → first 3 kept.

export const FOLLOWUPS_OPEN_TAG = "<followups>";
export const FOLLOWUPS_CLOSE_TAG = "</followups>";

// Non-greedy so a single reply never matches more than one block.
// The [\s\S] handles multi-line content since JS regex dot doesn't by
// default and we don't want a `/s` flag for ES2017 compat.
const FOLLOWUPS_REGEX = /<followups>([\s\S]*?)<\/followups>/i;

const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_CHARS = 120;

export type ExtractFollowupsResult = {
  /** Reply text with the <followups> block stripped and trimmed. */
  cleaned: string;
  /** 0-3 sanitized suggestion strings. Empty when no tag was present. */
  suggestions: string[];
};

/**
 * Pull the <followups>…</followups> block out of a reply. Returns the
 * cleaned reply text (tag gone, trimmed) alongside the parsed suggestion
 * list. Suggestions are trimmed, de-bulleted, length-capped, deduped,
 * and truncated to MAX_SUGGESTIONS.
 *
 * Safe to call on any reply — absent tag returns the original string
 * and an empty suggestions array.
 */
export function extractFollowups(reply: string): ExtractFollowupsResult {
  const match = reply.match(FOLLOWUPS_REGEX);
  if (!match) {
    return { cleaned: reply, suggestions: [] };
  }

  const innerRaw = match[1] ?? "";
  const seen = new Set<string>();
  const suggestions: string[] = [];

  for (const line of innerRaw.split("\n")) {
    const cleaned = line
      // Strip common bullet/list prefixes the model might emit
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      // Drop wrapping quotes
      .replace(/^["'`]+|["'`]+$/g, "")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;

    const capped = cleaned.slice(0, MAX_SUGGESTION_CHARS);
    // Explicit locale — the default `toLowerCase` is locale-dependent
    // (e.g. Turkish I), and dedup keys should be deterministic.
    const key = capped.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push(capped);
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  const cleanedReply = reply.replace(FOLLOWUPS_REGEX, "").trim();
  return { cleaned: cleanedReply, suggestions };
}
