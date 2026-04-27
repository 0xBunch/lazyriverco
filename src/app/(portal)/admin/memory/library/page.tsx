import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  AdminLibraryTable,
  type AdminLibraryItem,
} from "@/components/AdminLibraryTable";
import { AdminBulkUploader } from "@/components/AdminBulkUploader";

// /admin/memory/library — commissioner surface. The member-facing /library reads
// the same rows but filters to status=READY + hiddenFromGrid=false. This
// page deliberately shows ALL rows (including DELETED + PENDING) so the
// commissioner can see the full picture. Deleted rows are visually muted
// in the table so they don't visually compete with live ones.
//
// v1 scope: bulk select + bulk delete / hide / HoF / tag add / tag remove.
// Deferred per plan: tag merge/rename, CSV export. Upload is the existing
// MediaUploader wrapped for bulk in AdminBulkUploader.

export const dynamic = "force-dynamic";

export default async function AdminLibraryPage() {
  await requireAdmin();

  const rows = await prisma.media.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      uploadedBy: {
        select: { id: true, displayName: true, name: true },
      },
    },
  });

  const items: AdminLibraryItem[] = rows.map((r) => ({
    id: r.id,
    url: r.url,
    origin: r.origin,
    type: r.type,
    caption: r.caption,
    originTitle: r.originTitle,
    tags: r.tags,
    status: r.status,
    hallOfFame: r.hallOfFame,
    hiddenFromGrid: r.hiddenFromGrid,
    createdAt: r.createdAt,
    uploadedBy: r.uploadedBy,
  }));

  const readyCount = items.filter((i) => i.status === "READY").length;
  const hiddenCount = items.filter((i) => i.hiddenFromGrid).length;
  const deletedCount = items.filter((i) => i.status === "DELETED").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
          Library management
        </h1>
        <p className="mt-1 text-sm text-bone-300">
          {items.length} rows total · {readyCount} ready · {hiddenCount} hidden
          · {deletedCount} soft-deleted. Members see the{" "}
          <Link
            href="/library"
            className="underline decoration-claude-500/40 underline-offset-2 hover:text-bone-50"
          >
            live grid
          </Link>{" "}
          — status filters out pending + deleted + hidden.
        </p>
      </header>

      <section className="rounded-2xl border border-dashed border-bone-700 bg-bone-900/40 p-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-claude-300">
          Bulk upload
        </h2>
        <p className="mt-1 text-xs text-bone-300">
          Drop photos (JPG / PNG / WebP / GIF, ≤25 MB each). Each finished
          upload appears in the table after refresh.
        </p>
        <div className="mt-4">
          <AdminBulkUploader />
        </div>
      </section>

      <AdminLibraryTable items={items} />

      <p className="text-xs italic text-bone-400">
        v1.1 follow-ups parked here: tag merge / rename, CSV export, per-
        member uploader picker in the member-facing filter sheet.
      </p>
    </div>
  );
}
