import type { $Enums } from "@prisma/client";

// Single URL builder for /gallery deep-links. Replaces three near-
// identical helpers the simplicity review flagged:
//   - buildFilterSheetHref in gallery/page.tsx
//   - hrefWithout         in gallery/page.tsx
//   - buildHref           in GalleryFilterSheet.tsx
// All walked the same {q, tag, origin, byUserId} shape into URLSearchParams
// with identical conditional order. Only difference was whether they set
// `filter=1` (to open the sheet) or omitted it (to close).

export type GalleryUrlState = {
  q?: string | null;
  tag?: string | null;
  origin?: $Enums.MediaOrigin | null;
  byUserId?: string | null;
};

export type GalleryUrlOptions = {
  /** When true, append `filter=1` so the sheet opens on navigation. */
  openFilter?: boolean;
  /** When true, append `add=1` so the add modal opens on navigation. */
  openAdd?: boolean;
};

export function buildGalleryHref(
  state: GalleryUrlState,
  opts: GalleryUrlOptions = {},
): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.tag) sp.set("tag", state.tag);
  if (state.origin) sp.set("origin", state.origin);
  if (state.byUserId) sp.set("by", "me");
  if (opts.openFilter) sp.set("filter", "1");
  if (opts.openAdd) sp.set("add", "1");
  const qs = sp.toString();
  return qs ? `/gallery?${qs}` : "/gallery";
}
