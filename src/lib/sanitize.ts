// Pure string sanitizers for anything that flows from user or scraped
// input into an LLM prompt. Extracted from media-context.ts so they can
// run outside the server boundary — specifically in the prompt-injection
// eval at scripts/evals/gallery-injection.ts, which runs under tsx and
// can't cross a "server-only" import.
//
// Invariants enforced here and relied on across the app:
//   - markdown headers at line start get stripped (no section hijacking)
//   - <suggest-agent ...> sentinels stripped (case-insensitive)
//   - control characters \x00-\x1F and \x7F stripped
//   - whitespace collapsed
//   - length capped
// These are the same guarantees the eval asserts against an adversarial
// corpus.

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
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join(" ")
    .replaceAll(/<\s*suggest-agent\b[^>]*>/gi, "")
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
