import { formatUsd } from "./_format";

// Reusable per-dimension breakdown table. Used twice on /admin/ops/usage:
// once grouped by model, once grouped by operation. Pure server
// component — renders the already-sorted rows the page computed.
//
// Sort order is the responsibility of the parent (we receive rows as
// given). The page sorts by estimated cost desc so the money-movers
// land at the top; a client-side sort here would add weight for no
// meaningful interactivity on N<=7 distinct models/operations.

export type UsageBreakdownRow = {
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  estimatedCostUsd: number;
};

export type BreakdownTableProps = {
  title: string;
  rows: UsageBreakdownRow[];
};

export function BreakdownTable({ title, rows }: BreakdownTableProps) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-bone-700 bg-bone-900"
    >
      <header className="border-b border-bone-800 px-5 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-claude-300">
          {title}
        </h2>
      </header>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm italic text-bone-400">
          No events in this range yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bone-800 bg-bone-950/40">
                <Th className="w-2/5">Label</Th>
                <Th className="text-right">Requests</Th>
                <Th className="text-right">Input</Th>
                <Th className="text-right">Output</Th>
                <Th className="text-right">Cached</Th>
                <Th className="text-right">Est. cost</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-bone-800/50 last:border-b-0"
                >
                  <td className="px-4 py-2 align-middle font-mono text-xs text-bone-100">
                    {row.label}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-bone-200">
                    {row.requests.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-bone-300">
                    {row.inputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-bone-300">
                    {row.outputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-bone-300">
                    {row.cacheTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-bone-100">
                    {formatUsd(row.estimatedCostUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-bone-400 ${className}`}
    >
      {children}
    </th>
  );
}
