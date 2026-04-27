import { prisma } from "@/lib/prisma";
import type { SportsWag } from "@prisma/client";

/// Editorial scheduling only. Pinned via SportsWagFeature(featureDate).
/// No fallback hash-pick — when no row is scheduled for today, the
/// page renders an "On break today" placeholder instead of rolling a
/// random WAG. KB queues a week at a time via /admin/sports/wags/queue
/// (admin pages ship in a follow-up commit).
export type WagOfTheDay = {
  wag: SportsWag;
  /// Caption to display. Prefers SportsWagFeature.caption (per-feature
  /// editorial copy) over SportsWag.caption (default for the WAG).
  caption: string | null;
};

/// UTC midnight. The schedule rotates at this boundary, regardless of
/// the viewer's timezone — same WAG shows for everyone all day.
export function startOfUtcDay(date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getWagOfTheDay(
  date = startOfUtcDay(),
): Promise<WagOfTheDay | null> {
  const feature = await prisma.sportsWagFeature.findUnique({
    where: { featureDate: date },
    include: { wag: true },
  });
  if (!feature || feature.wag.hidden) return null;
  return {
    wag: feature.wag,
    caption: feature.caption ?? feature.wag.caption,
  };
}
