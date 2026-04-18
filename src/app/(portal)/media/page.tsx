import { redirect } from "next/navigation";

// Legacy /media route — the feature was renamed to "Library" in the
// v1 rewrite. 307 redirect (Next default) preserves any search params
// someone might have bookmarked or linked, so /media?tag=foo survives
// as /library?tag=foo. Keep this file around rather than deleting so
// old links from old chat messages don't 404.

export default function LegacyMediaPage() {
  redirect("/library");
}
