import { redirect } from "next/navigation";

// Legacy /admin/gallery route — the commissioner surface is now at
// /admin/memory/library with bulk tools. We rebuild the query string by
// hand because Next's `redirect(url)` passes the path through verbatim
// and does NOT propagate the incoming request's search params, so a
// naked `redirect("/admin/memory/library")` would silently drop
// bookmarked filters.

export default async function LegacyAdminGalleryPage({
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
  redirect(qs ? `/admin/memory/library?${qs}` : "/admin/memory/library");
}
