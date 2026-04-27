import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  ModelPricingPanel,
  type ModelPricingRow,
} from "./ModelPricingPanel";

// /admin/ops/pricing — ModelPricing rate-card editor. Extracted from
// /admin/ops/usage in PR 4 of the admin condensation series so the
// usage dashboard stays a pure read-only aggregate and pricing CRUD has
// its own surface (and its own ?range param namespace).

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  await requireAdmin();

  const pricingRaw = await prisma.modelPricing.findMany({
    orderBy: [{ provider: "asc" }, { model: "asc" }],
  });

  const pricingRows: ModelPricingRow[] = pricingRaw.map((p) => ({
    id: p.id,
    provider: p.provider,
    model: p.model,
    inputPerMTokUsd: p.inputPerMTokUsd,
    outputPerMTokUsd: p.outputPerMTokUsd,
    cacheReadPerMTokUsd: p.cacheReadPerMTokUsd,
    cacheWritePerMTokUsd: p.cacheWritePerMTokUsd,
    perImageUsd: p.perImageUsd,
    notes: p.notes,
    updatedAt: p.updatedAt,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
          Pricing
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-bone-300 text-pretty">
          Per-model rate card. Edits apply to future LLMUsageEvent rows
          only — past events stay locked to the rate at their time of
          recording (see <code>src/lib/usage.ts</code>).
        </p>
      </header>

      <ModelPricingPanel rows={pricingRows} />
    </div>
  );
}
