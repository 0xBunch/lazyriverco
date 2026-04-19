import { redirect } from "next/navigation";

// Legacy /media route — the feature was renamed to "Library" in the
// v1 rewrite. We rebuild the query string by hand because Next's
// `redirect(url)` passes the path through verbatim and does NOT
// propagate the incoming request's search params, so a naked
// `redirect("/library")` would silently drop `/media?tag=foo` to
// `/library` and break the chain into the new tag-URL redirects.

export default async function LegacyMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => sp.append(key, v));
  }
  const qs = sp.toString();
  redirect(qs ? `/library?${qs}` : "/library");
}
