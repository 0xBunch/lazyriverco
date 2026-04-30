import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getWagInsights } from "@/lib/sports/wag-archive";

export const dynamic = "force-dynamic";

// /sports/wags/insights — small at-a-glance panel of aggregations
// against the WAG archive. Shipped alongside the archive grid as the
// "robust data" angle of MLSN's WAG vertical.

export default async function WagInsightsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/start");

  const insights = await getWagInsights();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pt-20 md:pt-8">
      <nav className="mb-4 text-sm text-bone-600">
        <Link
          href="/sports/wags"
          className="inline-flex items-center gap-1 rounded px-1 hover:text-bone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
        >
          <span aria-hidden="true">←</span> WAG archive
        </Link>
      </nav>

      <header className="mb-8">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-bone-600">
          MLSN · WAG insights
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-bone-950 md:text-4xl">
          The numbers behind the archive
        </h1>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total partners" value={insights.totalWags} />
        <Stat label="Total features" value={insights.totalFeatures} />
        <Stat
          label="Sports covered"
          value={insights.bySport.filter((s) => s.count > 0).length}
        />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-bone-700">
          By sport
        </h2>
        <ul className="mt-3 divide-y divide-bone-200 rounded-sm border border-bone-200 bg-bone-50">
          {insights.bySport.length === 0 ? (
            <li className="px-4 py-3 text-sm italic text-bone-600">
              No partners in the roster yet.
            </li>
          ) : (
            insights.bySport.map((row) => (
              <li
                key={row.sport}
                className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm"
              >
                <Link
                  href={`/sports/wags?sport=${row.sport}`}
                  className="font-display text-[12px] font-semibold uppercase tracking-[0.2em] text-bone-950 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
                >
                  {row.sport}
                </Link>
                <span className="tabular-nums text-bone-800">{row.count}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-bone-700">
          Most-featured
        </h2>
        {insights.mostFeatured.length === 0 ? (
          <p className="mt-3 rounded-sm border border-bone-200 bg-bone-50 px-4 py-3 text-sm italic text-bone-600">
            No partners have been featured yet.
          </p>
        ) : (
          <ol
            className="mt-3 divide-y divide-bone-200 rounded-sm border border-bone-200 bg-bone-50"
            start={1}
          >
            {insights.mostFeatured.map((row, i) => (
              <li
                key={row.slug}
                className="flex items-baseline gap-3 px-4 py-3 text-sm"
              >
                <span className="w-6 font-display text-[11px] font-semibold uppercase tracking-[0.2em] tabular-nums text-bone-600">
                  {i + 1}
                </span>
                <Link
                  href={`/sports/wags/${row.slug}`}
                  className="flex-1 truncate font-medium text-bone-950 hover:underline"
                >
                  {row.name}
                </Link>
                <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-600">
                  {row.sport}
                </span>
                <span className="tabular-nums text-bone-800">{row.count}×</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-bone-200 bg-bone-50 p-4">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-bone-600">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-bone-950">
        {value}
      </p>
    </div>
  );
}
