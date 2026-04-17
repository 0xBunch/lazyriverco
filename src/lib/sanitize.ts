// Pure string sanitizers for anything that flows from user or scraped
// input into an LLM prompt. Extracted from media-context.ts so they can
// run outside the server boundary — specifically in the prompt-injection
// eval at scripts/evals/gallery-injection.ts, which runs under tsx and
// can't cross a "server-only" import.
//
// Invariants enforced here and relied on across the app:
//   - markdown headers at line start get stripped (no section hijacking)
//   - Unicode line/paragraph separators (\u2028, \u2029) treated as newlines
//     so attackers can't bury headers mid-string to dodge the line-start check
//   - zero-width / bidi-override / BOM chars stripped
//     (\u200B-\u200F, \u202A-\u202E, \uFEFF) — these let attackers bury
//     structure inside "clean-looking" text and break regex matches
//   - <suggest-agent ...> sentinels stripped (case-insensitive)
//   - ChatML / Llama turn markers stripped: <|system|>, <|...|>, [INST],
//     </system>, </human>, </assistant> — prevents a scraped originTitle
//     from posing as a system turn even if other guards miss it
//   - control characters \x00-\x1F and \x7F replaced with space (not
//     stripped — stripping concatenates words across tabs, caught by eval)
//   - whitespace collapsed
//   - length capped
// These are the same guarantees the eval asserts against an adversarial
// corpus. The eval catches regressions; this comment documents the intent.

export const MAX_MEDIA_IN_CONTEXT = 10;
export const MAX_CAPTION_CHARS = 200;
export const MAX_ORIGIN_TEXT_CHARS = 120;
export const MAX_TAGS_PER_ITEM = 20;

/**
 * Sanitize a string before it reaches an LLM prompt. Strips:
 *   - markdown headers (so the text can't inject its own sections)
 *   - <suggest-agent ...> sentinels (our handoff-CTA marker)
 *   - control characters
 *   - repeated whitespace
 * Caps at maxChars and returns null for empty / null input.
 */
export function sanitizeLLMText(
  raw: string | null | undefined,
  maxChars: number,
): string | null {
  if (!raw) return null;
  const cleaned = raw
    // Treat Unicode line/paragraph separators as newlines for the
    // header-strip step — attackers use these to bury a "# SYSTEM"
    // mid-string past the simple \n-based split.
    .split(/[\n\u2028\u2029]/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join(" ")
    // Zero-width joiners / bidi overrides / BOM — these let an attacker
    // write <su{ZWSP}ggest-agent> that the model may still read as the
    // sentinel, while regex matching fails.
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")
    // Handoff sentinel — our own marker. If an attacker writes it in
    // scraped text, we don't want the renderer to think the caption
    // is suggesting a handoff.
    .replaceAll(/<\s*suggest-agent\b[^>]*>/gi, "")
    // Model turn markers — ChatML (`<|system|>`, `<|end|>`, etc.),
    // Llama Instruct (`[INST]...[/INST]`), and HTML-shaped role tags
    // (`</system>`, `</human>`, `</assistant>`). Most models know at
    // least one family; blocking all three means a scraped originTitle
    // can't pose as a turn boundary.
    .replace(/<\|[^|>\n]{0,40}\|>/gi, "")
    .replace(/\[\/?INST\]/gi, "")
    .replace(/<\/?(system|human|assistant)\s*>/gi, "")
    // Replace control chars (incl. \t, \r, \v, \f, \x00, \x7F) with SPACE,
    // not empty string. Stripping entirely concatenates words across tabs
    // ("a\tb" -> "ab"); replacing with space + the next step's \s+ collapse
    // preserves word boundaries. The injection eval caught this regression.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, maxChars);
}

export function sanitizeTags(
  tags: readonly string[],
): readonly string[] {
  return tags
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 0 &&
        !t.startsWith("#") &&
        !t.startsWith("<") &&
        // eslint-disable-next-line no-control-regex
        !/[\x00-\x1F\x7F]/.test(t),
    )
    .slice(0, MAX_TAGS_PER_ITEM);
}
