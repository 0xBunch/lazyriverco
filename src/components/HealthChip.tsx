import { cn } from "@/lib/utils";
import type { FeedHealth } from "@/lib/feed-types";

// Colored chip for a FeedHealth value. Server component on purpose —
// the health value is always computed server-side (computeHealth) and
// this is rendered inside the /admin/memory/feeds page's RSC tree.

const STYLES: Record<FeedHealth, string> = {
  HEALTHY: "bg-emerald-900/40 text-emerald-300 ring-emerald-500/40",
  STALE: "bg-amber-900/40 text-amber-200 ring-amber-500/40",
  DEGRADED: "bg-orange-900/50 text-orange-200 ring-orange-500/50",
  FAILED: "bg-red-900/50 text-red-200 ring-red-500/50",
  DISABLED: "bg-bone-800 text-bone-400 ring-bone-600/50",
};

const LABELS: Record<FeedHealth, string> = {
  HEALTHY: "Healthy",
  STALE: "Stale",
  DEGRADED: "Degraded",
  FAILED: "Failed",
  DISABLED: "Disabled",
};

export function HealthChip({
  health,
  title,
}: {
  health: FeedHealth;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide ring-1 ring-inset",
        STYLES[health],
      )}
    >
      {LABELS[health]}
    </span>
  );
}
