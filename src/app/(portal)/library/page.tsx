import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  LibraryView,
  normalizeOrigin,
  normalizeQuery,
  normalizeTag,
  type LibrarySearchParams,
} from "./_view";

// /library — the shared visual bank. Every signed-in member sees the same
// feed (no per-item privacy; the point is sharing). URL params drive all
// state so the page is SSR-only, cache-friendly, and shareable:
//   ?q=keyword   full-text search across caption + origin* + tags
//   ?by=me       uploader filter — "me" = current session user
//   ?origin=...  MediaOrigin enum filter (UPLOAD/YOUTUBE/X/INSTAGRAM/WEB)
// The tag filter has its own route at /library/t/[tag] for shareable
// tag URLs; legacy /library?tag=X 307s there. Hall of Fame items get a
// featured hero row ONLY on the default view (no active filter); when
// filtering, the grid is flat so the filter predicate isn't second-
// guessed by the UX.

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<LibrarySearchParams>;
}) {
  const params = await searchParams;

  // Legacy redirect: /library?tag=X → /library/t/X. Preserves every
  // other query param so combined-filter bookmarks survive the cleanup.
  const tagFromQuery = normalizeTag(params.tag);
  if (tagFromQuery) {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.by) sp.set("by", params.by);
    if (params.origin) sp.set("origin", params.origin);
    if (params.add) sp.set("add", params.add);
    if (params.filter) sp.set("filter", params.filter);
    const qs = sp.toString();
    redirect(
      `/library/t/${encodeURIComponent(tagFromQuery)}${qs ? `?${qs}` : ""}`,
    );
  }

  const user = await requireUser();

  return (
    <LibraryView
      viewer={user}
      q={normalizeQuery(params.q)}
      tag={null}
      originFilter={normalizeOrigin(params.origin)}
      byUserId={(params.by ?? "").trim() === "me" ? user.id : null}
      addOpen={params.add === "1"}
      filterOpen={params.filter === "1"}
    />
  );
}
