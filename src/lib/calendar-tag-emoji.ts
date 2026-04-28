// Tag-driven glyph for cron-synced events. Pairs with the ↻ glyph already
// used by annual entries — synced events aren't annual (each is a
// concrete dated row), so the visual slot is free. Returns null when no
// known tag matches; the renderer falls back to a glyph-less chip.
//
// Precedence is ordered most-specific → least: a Thanksgiving NFL game
// would (hypothetically) carry both ["nfl"] and ["holiday"] tags; the
// football glyph wins because the football date is the more salient,
// once-a-year event. Reorder the cases to change precedence.
export function tagEmoji(tags: readonly string[]): string | null {
  if (tags.includes("moon")) return "🌕";
  if (tags.includes("season")) return "☀";
  if (tags.includes("nfl")) return "🏈";
  if (tags.includes("holiday")) return "🎉";
  return null;
}
