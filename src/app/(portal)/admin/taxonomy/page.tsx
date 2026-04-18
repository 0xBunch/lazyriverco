import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  TaxonomyEditor,
  type BucketView,
} from "./TaxonomyEditor";

// /admin/taxonomy — controlled-vocabulary hints for the Gemini vision
// tagger. Admin-only. Edits take effect on the next tagging call on
// this Next process (the action busts the in-memory cache); other
// processes behind Railway's LB pick up the change within 60s via TTL.

export const dynamic = "force-dynamic";

export default async function AdminTaxonomyPage() {
  await requireAdmin();

  const rows = await prisma.taxonomyBucket.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const buckets: BucketView[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    slugs: r.slugs,
    sortOrder: r.sortOrder,
  }));

  const totalSlugs = buckets.reduce((sum, b) => sum + b.slugs.length, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
          Vision taxonomy
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-bone-300 text-pretty">
          Controlled-vocabulary hints Gemini prefers when tagging gallery
          images. {totalSlugs} slug{totalSlugs === 1 ? "" : "s"} across{" "}
          {buckets.length} bucket{buckets.length === 1 ? "" : "s"}. Empty
          buckets fall through to open vocabulary. Edits apply to the next
          tagging call (~instant on this server, ≤60 s across the cluster).
        </p>
      </header>

      <TaxonomyEditor buckets={buckets} />

      <p className="text-xs italic text-bone-400">
        After editing, trigger a re-analyze on existing items via the bulk
        button on /admin/gallery or `pnpm backfill:ai-tags` — new hints
        don&apos;t retroactively re-tag.
      </p>
    </div>
  );
}
