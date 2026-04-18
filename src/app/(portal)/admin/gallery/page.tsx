import { redirect } from "next/navigation";

// Legacy /admin/gallery route — the commissioner surface is now at
// /admin/library with bulk tools. 307 redirect (Next default)
// preserves any search params so bookmarks keep working.

export default function LegacyAdminGalleryPage() {
  redirect("/admin/library");
}
