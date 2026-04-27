import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { SummaryCards } from "./SummaryCards";
import { ByUserTable, type UsageByUserRow } from "./ByUserTable";
import {
  BreakdownTable,
  type UsageBreakdownRow,
} from "./BreakdownTable";

// /admin/members/usage — read-only dashboard for per-user LLM usage
// accounting. One server component owns every aggregate: summary
// cards, per-user table, per-model and per-operation breakdowns. All
// four Prisma queries fan out in a single Promise.all so the page
// renders after the slowest aggregate, not the sum of them.
//
// Range selector is URL-driven (?range=7d|30d|90d|all, default 30d)
// so the page stays SSR-only and shareable. The cutoff clause is
// applied identically to every aggregate so the summary and the
// breakdowns can't disagree. ModelPricing CRUD lives at
// /admin/members/pricing — extracted in PR 4 so this surface stays
// purely a read-only aggregate.

export const dynamic = "force-dynamic";

type Range = "7d" | "30d" | "90d" | "all";

const RANGE_LABELS: Record<Range, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const RANGES: readonly Range[] = ["7d", "30d", "90d", "all"] as const;

function normalizeRange(raw: string | undefined): Range {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") {
    return raw;
  }
  return "30d";
}

function rangeCutoff(range: Range): Date | null {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  switch (range) {
    case "7d":
      return new Date(now - 7 * DAY_MS);
    case "30d":
      return new Date(now - 30 * DAY_MS);
    case "90d":
      return new Date(now - 90 * DAY_MS);
    case "all":
      return null;
  }
}

type SearchParams = { range?: string };

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const range = normalizeRange(params.range);
  const cutoff = rangeCutoff(range);

  // `undefined` on `gte` = no clause at all; Prisma omits it from the
  // generated WHERE. Lets `all` share the same query shape as the
  // bounded ranges without forking the call sites.
  const createdAtClause = cutoff ? { gte: cutoff } : undefined;
  const whereRange = createdAtClause
    ? { createdAt: createdAtClause }
    : {};

  const [
    summary,
    byUserRaw,
    byModelRaw,
    byOperationRaw,
  ] = await Promise.all([
    prisma.lLMUsageEvent.aggregate({
      where: whereRange,
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheCreationTokens: true,
        estimatedCostUsd: true,
      },
    }),
    prisma.lLMUsageEvent.groupBy({
      by: ["userId"],
      where: whereRange,
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
      },
      _max: { createdAt: true },
    }),
    prisma.lLMUsageEvent.groupBy({
      by: ["model"],
      where: whereRange,
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
      where: whereRange,
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
      },
    }),
  ]);

  // Hydrate user names in a single findMany — no N+1 lookups per row.
  // Filter out null ids; nulls become a single "System" row below.
  const userIds = byUserRaw
    .map((r) => r.userId)
    .filter((id): id is string => typeof id === "string");

  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, displayName: true },
        })
      : [];
  const usersById = new Map(users.map((u) => [u.id, u]));

  const byUser: UsageByUserRow[] = byUserRaw.map((r) => {
    const user = r.userId ? usersById.get(r.userId) : null;
    return {
      userId: r.userId,
      displayName:
        user?.displayName ?? user?.name ?? (r.userId === null ? "System" : "Unknown"),
      requests: r._count._all,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      cacheTokens: r._sum.cacheReadTokens ?? 0,
      estimatedCostUsd: r._sum.estimatedCostUsd ?? 0,
      lastCall: r._max.createdAt ?? null,
    };
  });

  const byModel: UsageBreakdownRow[] = byModelRaw
    .map((r) => ({
      label: r.model,
      requests: r._count._all,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      cacheTokens: r._sum.cacheReadTokens ?? 0,
      estimatedCostUsd: r._sum.estimatedCostUsd ?? 0,
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
          Usage
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-bone-300 text-pretty">
          Per-member LLM usage and spend. Every Anthropic + Gemini call
          records token counts, latency, and an estimated dollar cost
          computed from the rates below at the time of the call. Pick a
          range, drill into a member to see their call log, edit rates
          for future calls.
        </p>
      </header>

      <RangeSelector current={range} />

      <SummaryCards
        requests={summary._count._all}
        inputTokens={summary._sum.inputTokens ?? 0}
        outputTokens={summary._sum.outputTokens ?? 0}
        estimatedCostUsd={summary._sum.estimatedCostUsd ?? 0}
      />

      <ByUserTable rows={byUser} />

      <div className="grid gap-6 md:grid-cols-2">
        <BreakdownTable title="By model" rows={byModel} />
        <BreakdownTable title="By operation" rows={byOperation} />
      </div>
    </div>
  );
}

function RangeSelector({ current }: { current: Range }) {
  return (
    <nav
      aria-label="Usage date range"
      className="flex flex-wrap gap-1 rounded-full border border-bone-800 bg-bone-900/40 p-1 w-fit"
    >
      {RANGES.map((r) => {
        const active = r === current;
        // `all` is represented as the default omission of ?range — the
        // link always sets the query param explicitly so the URL
        // matches the visible selection.
        return (
          <Link
            key={r}
            href={`/admin/members/usage?range=${r}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              active
                ? "bg-claude-500/20 text-claude-100"
                : "text-bone-300 hover:text-bone-100",
            )}
          >
            {RANGE_LABELS[r]}
          </Link>
        );
      })}
    </nav>
  );
}
