import { redirect } from "next/navigation";

// Legacy /gallery/[id] item deep link — redirect to /library/[id].
// Chat messages and Discord links pasted before the v1.6 rename link
// directly to the detail page, so a stub on the collection route alone
// isn't enough.

export default async function LegacyGalleryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/library/${id}`);
}
