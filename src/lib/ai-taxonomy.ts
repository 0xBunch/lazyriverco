// Controlled-vocabulary hints for Gemini vision tagging. These aren't
// hard constraints — Gemini still assigns its own tags freely — but when
// one of the listed slugs fits, the model strongly prefers it over a
// synonym. Keeps the tag cloud coherent ("chicago-bears" vs "bears",
// "nfl-bears", "da-bears"; "vegas" vs "las-vegas"; etc).
//
// Edit this file to seed KB-specific vocabulary. Empty arrays = no hint
// injected (fully open vocabulary, same as v1.3 ship).
//
// How the hints flow through: src/lib/ai-tagging.ts concatenates the
// non-empty buckets into a short block appended to SYSTEM_INSTRUCTION.
// Phrasing in the prompt deliberately avoids "MUST use these" — that
// triggered refusals in smoke-testing on images the model couldn't map
// onto the canon. "Prefer these slugs when applicable" is the right
// pressure level.

export type TaxonomyBucket = {
  label: string;
  slugs: string[];
};

export const TAXONOMY: TaxonomyBucket[] = [
  // People the crew references often. Full-name slugs only, match the
  // shape the model already produces for public figures.
  //
  // Examples to uncomment/replace with real names:
  //   { label: "crew", slugs: ["kyle-bunch", "jason-bunch", "…"] },
  //   { label: "recurring-figures", slugs: ["sidney-sweeney", "…"] },
  { label: "people", slugs: [] },

  // Places + venues that recur. Use full canonical slugs so different
  // angles / daytime-vs-nighttime of the same place converge.
  //
  //   { label: "places", slugs: ["tao-chicago", "wrigley-field", "miami-beach"] },
  { label: "places", slugs: [] },

  // Activities + recurring themes. Keep these concrete — "red-carpet"
  // not "fashion", "pool-day" not "vacation".
  //
  //   { label: "vibes", slugs: ["pool-day", "bachelor-party", "golf-trip"] },
  { label: "vibes", slugs: [] },

  // Teams / franchises / brands that come up in the chat. Dedup across
  // sources ("bears" / "nfl-bears" / "da-bears" → "chicago-bears").
  //
  //   { label: "teams", slugs: ["chicago-bears", "chicago-cubs", "chelsea-fc"] },
  { label: "teams", slugs: [] },
];

/**
 * Returns the taxonomy-hint block for injection into SYSTEM_INSTRUCTION,
 * or an empty string when every bucket is empty (no hint = fully open
 * vocabulary; the v1.3 ship behavior).
 */
export function buildTaxonomyHint(): string {
  const nonEmpty = TAXONOMY.filter((b) => b.slugs.length > 0);
  if (nonEmpty.length === 0) return "";

  const lines = nonEmpty.map(
    (b) => `- ${b.label}: ${b.slugs.join(", ")}`,
  );
  return [
    "",
    "Preferred vocabulary — when any of the following slugs applies, use it verbatim instead of a synonym. You may still add other tags outside this list.",
    ...lines,
  ].join("\n");
}
