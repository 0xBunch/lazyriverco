import { redirect } from "next/navigation";

// Legacy /gallery route — the feature was renamed to "Library" in the
// v1.6 rename. 307 redirect (Next default) preserves any search params
// someone might have bookmarked or linked, so /gallery?tag=foo survives
// as /library?tag=foo. Keep this file around rather than deleting so
// old links from old chat messages don't 404.

export default function LegacyGalleryPage() {
  redirect("/library");
}
