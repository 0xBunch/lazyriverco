// Four summary cards at the top of /admin/usage. Pure presentational —
// the server page does all the aggregation and passes the already-
// computed numbers in. No client JS; renders inside the server tree.

export type SummaryCardsProps = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

// Kept local rather than a shared util — usage formatting is specific
// to this surface (4-decimal for sub-cent rows) and the spec caps this
// feature at 8 new files. Duplicated in the sibling client components
// on purpose; cross-file reuse would need a 9th file.
function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function SummaryCards({
  requests,
  inputTokens,
  outputTokens,
  estimatedCostUsd,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card label="Requests" value={requests.toLocaleString()} />
      <Card label="Input tokens" value={inputTokens.toLocaleString()} />
      <Card label="Output tokens" value={outputTokens.toLocaleString()} />
      <Card label="Estimated cost" value={formatUsd(estimatedCostUsd)} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-bone-700 bg-bone-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-bone-400">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-bone-50">
        {value}
      </p>
    </div>
  );
}
