// Two-character initials from a display name — used in avatar fallbacks
// across the gallery (tile avatars, detail page uploader badge, thread
// row avatars). Extracted because the inline ".split(/\s+/).slice(0,2)
// .map(s => s[0]?.toUpperCase() ?? '').join('')" was repeated in three
// spots. One canonical implementation; no behavior change.

export function initialsOf(displayName: string): string {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
