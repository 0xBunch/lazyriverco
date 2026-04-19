import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  LibraryView,
  normalizeOrigin,
  normalizeQuery,
  normalizeTag,
  type LibrarySearchParams,
} from "../../_view";

// /library/t/[tag] — tag-filtered library. Tag lives in the path so
// /library/t/sydney-sweeney is shareable and namespaced away from the
// /library/[id] media-detail route. Other filters (q, by, origin) ride
// as query params on top — same shape as the index page.

export const dynamic = "force-dynamic";

type Params = { tag: string };
// `tag` is in the path, not searchParams, so omit it from this route's
// query-param contract.
type TagSearchParams = Omit<LibrarySearchParams, "tag">;

export default async function LibraryTagPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<TagSearchParams>;
}) {
  const { tag: rawTag } = await params;
  const tag = normalizeTag(rawTag);
  // Bad tag shape (uppercase, punctuation, too long) → 404 rather than
  // silently rendering an empty grid that pretends the URL was valid.
  if (!tag) notFound();

  const sp = await searchParams;
  const user = await requireUser();

  return (
    <LibraryView
      viewer={user}
      q={normalizeQuery(sp.q)}
      tag={tag}
      originFilter={normalizeOrigin(sp.origin)}
      byUserId={(sp.by ?? "").trim() === "me" ? user.id : null}
      addOpen={sp.add === "1"}
      filterOpen={sp.filter === "1"}
    />
  );
}
