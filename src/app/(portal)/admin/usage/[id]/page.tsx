import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { BreakdownTable, type UsageBreakdownRow } from "../BreakdownTable";
import { SummaryCards } from "../SummaryCards";
import { EventsTable, type UsageEventRow } from "./EventsTable";

// Per-user drilldown. Header card shows 30-day + lifetime totals,
// followed by a per-operation breakdown and a reverse-chronological
// log of the last 100 events. No pagination (v1 cap of 100).

export const dynamic = "force-dynamic";

type Params = { id: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminUsageMemberPage({
  params,
}: {
  params: Promise<Params>;
}) {
  await requireAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, displayName: true, role: true },
  });
  if (!user) notFound();

  const thirtyDayCutoff = new Date(Date.now() - 30 * DAY_MS);

  // Lifetime + 30-day aggregates, per-operation breakdown, and recent
  // events fanned out in parallel. All scoped to this user id.
  const [lifetime, last30d, byOperationRaw, recentRaw] = await Promise.all([
    prisma.lLMUsageEvent.aggregate({
      where: { userId: id },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
      },
    }),
    prisma.lLMUsageEvent.aggregate({
      where: { userId: id, createdAt: { gte: thirtyDayCutoff } },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
      },
    }),
    prisma.lLMUsageEvent.groupBy({
      by: ["operation"],
      where: { userId: id, createdAt: { gte: thirtyDayCutoff } },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
      },
    }),
    prisma.lLMUsageEvent.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        operation: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
        requestMs: true,
        success: true,
        errorCode: true,
        conversationId: true,
      },
    }),
  ]);

  const byOperation: UsageBreakdownRow[] = byOperationRaw
    .map((r) => ({
      label: r.operation,
      requests: r._count._all,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      cacheTokens: r._sum.cacheReadTokens ?? 0,
      estimatedCostUsd: r._sum.estimatedCostUsd ?? 0,
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  const events: UsageEventRow[] = recentRaw;

  const displayName = user.displayName || user.name;
  const lifetimeCost = lifetime._sum.estimatedCostUsd ?? 0;
  const last30DayCost = last30d._sum.estimatedCostUsd ?? 0;

  return (
    <div className="space-y-6">
      <nav className="text-xs uppercase tracking-[0.2em] text-bone-400">
        <Link
          href="/admin/usage"
          className="transition-colors hover:text-bone-200"
        >
          ← All members
        </Link>
      </nav>

      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
          Member usage
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
          {displayName}
        </h1>
        <p className="mt-1 text-xs text-bone-400">
          {user.role} · lifetime ${lifetimeCost.toFixed(2)} · last 30 days $
          {last30DayCost.toFixed(2)}
        </p>
      </header>

      <section aria-label="Last 30 days">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-400">
          Last 30 days
        </h2>
        <SummaryCards
          requests={last30d._count._all}
          inputTokens={last30d._sum.inputTokens ?? 0}
          outputTokens={last30d._sum.outputTokens ?? 0}
          estimatedCostUsd={last30DayCost}
        />
      </section>

      <BreakdownTable title="By operation (last 30 days)" rows={byOperation} />

      <section aria-label="Recent events">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-400">
          Recent events (last {events.length} of max 100)
        </h2>
        <EventsTable rows={events} />
      </section>
    </div>
  );
}
