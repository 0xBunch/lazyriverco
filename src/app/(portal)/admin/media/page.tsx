import { redirect } from "next/navigation";

// Legacy /admin/media route — the commissioner surface is now at
// /admin/gallery with bulk tools. 307 redirect (Next default)
// preserves any search params so bookmarks keep working.

export default function LegacyAdminMediaPage() {
  redirect("/admin/gallery");
}
