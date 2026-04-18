// Pure date-bucketing helper for the /chats list (and anywhere else
// that wants to group items into Today / Yesterday / Previous 7 Days /
// Previous 30 Days / Older sections).
//
// All date math runs in the runtime timezone. On Railway that's UTC,
// which means a conversation created at 11pm CT will land in "Yesterday"
// the next morning even though it's "today" for the user. Acceptable
// for v1 — TZ-aware bucketing would need a cookie or header-supplied
// IANA zone.

export type DateBucket =
  | "Today"
  | "Yesterday"
  | "Previous 7 Days"
  | "Previous 30 Days"
  | "Older";

export const DATE_BUCKET_ORDER: readonly DateBucket[] = [
  "Today",
  "Yesterday",
  "Previous 7 Days",
  "Previous 30 Days",
  "Older",
] as const;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function bucketFor(when: Date, now: Date = new Date()): DateBucket {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - ONE_DAY_MS);
  const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * ONE_DAY_MS);
  const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * ONE_DAY_MS);

  if (when >= startOfToday) return "Today";
  if (when >= startOfYesterday) return "Yesterday";
  if (when >= sevenDaysAgo) return "Previous 7 Days";
  if (when >= thirtyDaysAgo) return "Previous 30 Days";
  return "Older";
}

export function groupByDateBucket<T>(
  items: readonly T[],
  getDate: (item: T) => Date,
  now: Date = new Date(),
): Array<{ bucket: DateBucket; items: T[] }> {
  const groups = new Map<DateBucket, T[]>();
  for (const item of items) {
    const b = bucketFor(getDate(item), now);
    const existing = groups.get(b);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(b, [item]);
    }
  }
  return DATE_BUCKET_ORDER.filter((b) => groups.has(b)).map((bucket) => ({
    bucket,
    items: groups.get(bucket)!,
  }));
}

/**
 * Compact relative timestamp ("2m" / "5h" / "3d" / "Mar 12") for row
 * meta. Mirrors claude.ai/recents conventions. Anything older than 7
 * days falls back to "MMM d".
 */
export function relativeShort(when: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - when.getTime();
  if (diffMs < 60 * 1000) return "now";
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return when.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
