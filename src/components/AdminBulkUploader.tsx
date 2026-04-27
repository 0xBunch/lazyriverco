"use client";

import { useRouter } from "next/navigation";
import { MediaUploader } from "@/components/MediaUploader";

// Thin wrapper around MediaUploader for the /admin/memory/library bulk surface.
// After each successful upload we router.refresh() so the admin table
// picks up the new row without a manual reload. maxFiles={null} lifts
// the one-at-a-time cap the add modal uses — bulk backfills are the
// whole point of this surface.

export function AdminBulkUploader() {
  const router = useRouter();
  return (
    <MediaUploader
      maxFiles={null}
      onUploaded={() => {
        router.refresh();
      }}
    />
  );
}
