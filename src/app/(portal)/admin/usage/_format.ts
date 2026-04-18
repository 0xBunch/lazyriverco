// Shared USD formatting for /admin/usage views. Sub-cent rows get 4
// decimal places so $0.003 doesn't render as $0.00 (which would look
// like a bug); everything else uses 2. Used by every table on this
// surface — keep the rule in one place so decimal behavior is
// consistent whether you're reading the per-user total or a single
// event's cost.
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}
