import "server-only";

// Preset editorial tags for /sports/news. Two pieces:
//
//   1. SPORTS_NEWS_TAGS — the canonical list, in display order. The
//      filter chips on /sports/news render these in this order, and
//      tag pills on item cards style anything outside this list as a
//      "custom" tag (admin-added) so renames don't silently disappear.
//
//   2. TAG_KEYWORDS — keyword fragments matched against each item's
//      title + excerpt at insert time (case-insensitive). Hit any
//      fragment for a tag → tag is applied. This is intentionally
//      simple regex — no AI, no scoring, no NLP. KB controls coverage
//      by editing the keyword arrays.
//
// To add a tag KB defines:
//   - Add to SPORTS_NEWS_TAGS in display order.
//   - Add the matching fragments to TAG_KEYWORDS.
// Existing items are not retroactively re-tagged; runs at insert.

export const SPORTS_NEWS_TAGS = [
  "Trade",
  "Injury",
  "Draft",
  "Playoff",
  "Free-Agency",
  "Coaching",
  "Game-Recap",
  "Power-Rankings",
  "Fantasy",
  "Betting",
  "Off-Field",
  "Recruiting",
] as const;

export type SportsNewsTag = (typeof SPORTS_NEWS_TAGS)[number];

const TAG_KEYWORDS: Record<SportsNewsTag, readonly string[]> = {
  Trade: ["trade", "traded", "dealing", "shipped to", "acquires"],
  Injury: ["injur", "concussion", "hamstring", "acl", "torn", "out for", "game-time decision", "ruled out"],
  Draft: ["draft", "drafted", "draft pick", "first round", "top pick", "kiper", "mock draft"],
  Playoff: ["playoff", "playoffs", "first round", "conference final", "stanley cup", "world series", "super bowl", "championship game", "bracket"],
  "Free-Agency": ["free agent", "free agency", "signs with", "signing with", "signed with", "extension", "contract"],
  Coaching: ["fires", "fired", "hires", "hired", "head coach", "manager", "interim", "coordinator"],
  "Game-Recap": ["beat", "defeated", "win over", "loss to", "blowout", "walk-off", "overtime", "game-winning", "highlights from"],
  "Power-Rankings": ["power ranking", "power rankings", "way-too-early", "top 25", "top 10"],
  Fantasy: ["fantasy", "waiver", "start/sit", "rookie redraft", "dynasty"],
  Betting: ["betting", "odds", "favorite", "futures", "prop bet", "over/under", "moneyline"],
  "Off-Field": ["arrest", "lawsuit", "suspended", "suspension", "gambling", "ppg", "personal", "controversy", "off the field"],
  Recruiting: ["recruit", "commit", "transfer portal", "five-star", "4-star", "five star"],
};

// Build a single regex per tag once at module load. Fragments are
// lowercased + word-boundary-flexible — substring match is fine for the
// short fragments we use, and anchoring would miss "trade" in "traded".
const TAG_PATTERNS: Array<{ tag: SportsNewsTag; re: RegExp }> = SPORTS_NEWS_TAGS.map((tag) => ({
  tag,
  re: new RegExp(
    TAG_KEYWORDS[tag]
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "i",
  ),
}));

/**
 * Compute tags for a news item from its title + excerpt by matching
 * against the keyword map. Pure function — testable in isolation. Order
 * of returned tags follows SPORTS_NEWS_TAGS so the UI renders pills
 * predictably.
 */
export function autoTagNewsItem(
  title: string,
  excerpt: string | null,
): SportsNewsTag[] {
  const haystack = `${title} ${excerpt ?? ""}`;
  return TAG_PATTERNS.filter(({ re }) => re.test(haystack)).map((p) => p.tag);
}
