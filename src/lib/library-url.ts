import type { $Enums } from "@prisma/client";

// Single URL builder for /library deep-links. Replaces three near-
// identical helpers the simplicity review flagged:
//   - buildFilterSheetHref in library/page.tsx
//   - hrefWithout         in library/page.tsx
//   - buildHref           in LibraryFilterSheet.tsx
// All walked the same {q, tag, origin, byUserId} shape into URLSearchParams
// with identical conditional order. Only difference was whether they set
// `filter=1` (to open the sheet) or omitted it (to close).

export type LibraryUrlState = {
  q?: string | null;
  tag?: string | null;
  origin?: $Enums.MediaOrigin | null;
  byUserId?: string | null;
};

export type LibraryUrlOptions = {
  /** When true, append `filter=1` so the sheet opens on navigation. */
  openFilter?: boolean;
  /** When true, append `add=1` so the add modal opens on navigation. */
  openAdd?: boolean;
};

export function buildLibraryHref(
  state: LibraryUrlState,
  opts: LibraryUrlOptions = {},
): string {
  // Tag lives in the path (/library/t/{tag}) so tag pages are
  // shareable and namespaced away from the /library/[id] detail
  // route. Every other filter stays in the query string.
  const tagSegment = state.tag ? `/t/${encodeURIComponent(state.tag)}` : "";
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.origin) sp.set("origin", state.origin);
  if (state.byUserId) sp.set("by", "me");
  if (opts.openFilter) sp.set("filter", "1");
  if (opts.openAdd) sp.set("add", "1");
  const qs = sp.toString();
  return `/library${tagSegment}${qs ? `?${qs}` : ""}`;
}
