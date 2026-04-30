import { prisma } from "@/lib/prisma";
import type { SportsWag } from "@prisma/client";

/// Editorial scheduling only. Pinned via SportsWagFeature(featureDate).
/// No fallback hash-pick — when no row is scheduled for today, the
/// page renders an "On break today" placeholder instead of rolling a
/// random WAG. KB queues a week at a time via /admin/sports/wags/queue.
export type WagOfTheDay = {
  wag: SportsWag;
  /// Caption to display. Prefers SportsWagFeature.caption (per-feature
  /// editorial copy) over SportsWag.caption (default for the WAG).
  caption: string | null;
  /// Pre-computed image URL the cover should render. Either the R2
  /// public URL when imageR2Key is set (no proxy hop needed; R2 public
  /// is hotlink-safe) or the in-app proxy route otherwise.
  imageRenderUrl: string;
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
    imageRenderUrl: resolveImageRenderUrl(feature.wag),
  };
}

/// Count of features scheduled on or before `date`. Powers the "№ 003"
/// callsign in the corner of the cover. Cheap (one indexed count) so
/// we run it inline in the /sports page render.
export async function getWagSerial(date = startOfUtcDay()): Promise<number> {
  return prisma.sportsWagFeature.count({
    where: { featureDate: { lte: date } },
  });
}

function resolveImageRenderUrl(wag: SportsWag): string {
  // R2 public URLs are hotlink-safe, so when the admin uploaded a
  // permanent copy we point next/image straight at the CDN. Falls back
  // to the proxy route for legacy / external image URLs (Wikipedia,
  // wire services, etc.) — those still need the cross-origin shim the
  // proxy provides.
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (wag.imageR2Key && base) {
    return `${base.replace(/\/+$/, "")}/${wag.imageR2Key}`;
  }
  return `/api/sports/wag/image?wagId=${encodeURIComponent(wag.id)}`;
}
