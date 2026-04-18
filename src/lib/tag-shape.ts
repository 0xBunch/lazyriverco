// Shared slug/tag shape for the gallery. Every surface that accepts a
// tag from a user or emits one from the model agrees on this regex +
// length cap so the FTS index, the tag cloud, and the Gemini prompt
// hints all behave identically. Keeping this in one place stops the
// same literal from drifting across four files.
//
// Shape: lowercase a-z or 0-9 in the leading position, then lowercase
// letters/digits/dashes/underscores. No spaces, no dots, no Unicode.
// Matches the alphabet Gemini already produces for public-figure name
// slugs ("sidney-sweeney") and the tag cloud treats as canonical.

export const TAG_SHAPE = /^[a-z0-9][a-z0-9\-_]*$/;
export const MAX_TAG_CHARS = 40;

/**
 * Validate and normalize a single tag/slug from any source — FormData,
 * a parsed string, or null. Trims, lowercases, then checks length + shape.
 * Returns the normalized slug on success, or null on any rejection.
 *
 * Single-value validator. Callers that need per-entry error messages
 * (e.g. the paste-a-comma-list flow in gallery/actions.ts) should keep
 * their own loop but use `TAG_SHAPE` + `MAX_TAG_CHARS` directly.
 */
export function parseTag(
  raw: FormDataEntryValue | string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_TAG_CHARS) return null;
  if (!TAG_SHAPE.test(normalized)) return null;
  return normalized;
}
