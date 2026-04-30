import { prisma } from "@/lib/prisma";
import type { SportTag, SportsWag } from "@prisma/client";

// Query helpers + slug derivation for the public WAG archive
// (/sports/wags) and per-WAG profile pages (/sports/wags/[slug]).
//
// Slug strategy: `slugify(name)-<short-id>`. Computed on read; not
// stored in the DB. The 8-character id suffix prevents collisions
// when two WAGs share a name (e.g. multiple "Jane Smiths") and lets
// us re-derive a slug from any SportsWag row without a migration.

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const;
type Sport = (typeof SPORTS)[number];

export function isSportTag(value: string): value is Sport {
  return (SPORTS as readonly string[]).includes(value);
}

export function wagSlug(wag: { id: string; name: string }): string {
  const stem = slugify(wag.name);
  const shortId = wag.id.slice(0, 8);
  return `${stem || "wag"}-${shortId}`;
}

/// Inverse of wagSlug. Extracts the 8-char short id from a slug and
/// matches against SportsWag.id. Returns null when the slug shape is
/// wrong or no row matches.
export async function findWagBySlug(
  slug: string,
): Promise<SportsWag | null> {
  // Slug shape: <stem>-<8 hex chars>. The stem is anything before the
  // last dash that's followed by exactly 8 hex chars at end-of-string.
  // Anchored end-of-string + char class so a stem containing dashes
  // ("ciara-w-12345678") still resolves correctly.
  const m = slug.match(/-([0-9a-f]{8})$/i);
  if (!m) return null;
  const shortId = m[1].toLowerCase();
  return prisma.sportsWag.findFirst({
    where: {
      hidden: false,
      id: { startsWith: shortId },
    },
  });
}

export type WagArchiveRow = {
  id: string;
  slug: string;
  name: string;
  athleteName: string;
  sport: SportTag;
  team: string | null;
  imageUrl: string;
  imageR2Key: string | null;
  caption: string | null;
  notableFact: string | null;
  instagramHandle: string | null;
  /// Most recent featureDate across all SportsWagFeature rows. null
  /// when the WAG has never been featured (still in the roster, not
  /// yet scheduled). Powers the "last featured" sort + caption.
  lastFeaturedAt: Date | null;
  /// Total times this WAG has appeared on /sports. Powers the
  /// "most-featured" insight panel.
  featureCount: number;
};

export type WagArchiveFilters = {
  sport?: SportTag;
};

/// Cross-sport archive query. Excludes hidden rows. Sort is
/// (most-recently featured first, then alphabetical name) so a
/// freshly-featured WAG bubbles to the top.
export async function getWagArchive(
  filters: WagArchiveFilters = {},
): Promise<WagArchiveRow[]> {
  const wags = await prisma.sportsWag.findMany({
    where: {
      hidden: false,
      ...(filters.sport ? { sport: filters.sport } : {}),
    },
    include: {
      features: {
        select: { featureDate: true },
        orderBy: { featureDate: "desc" },
      },
    },
  });
  return wags
    .map((w): WagArchiveRow => ({
      id: w.id,
      slug: wagSlug(w),
      name: w.name,
      athleteName: w.athleteName,
      sport: w.sport,
      team: w.team,
      imageUrl: w.imageUrl,
      imageR2Key: w.imageR2Key,
      caption: w.caption,
      notableFact: w.notableFact,
      instagramHandle: w.instagramHandle,
      lastFeaturedAt: w.features[0]?.featureDate ?? null,
      featureCount: w.features.length,
    }))
    .sort((a, b) => {
      // Most-recently-featured first; ties + never-featured fall through
      // to alphabetical name. WAGs that have never been featured still
      // appear in the archive — they just sort to the bottom of any
      // sport bucket.
      const at = a.lastFeaturedAt?.getTime() ?? -Infinity;
      const bt = b.lastFeaturedAt?.getTime() ?? -Infinity;
      if (at !== bt) return bt - at;
      return a.name.localeCompare(b.name);
    });
}

export type WagProfile = {
  wag: SportsWag;
  imageRenderUrl: string;
  features: { featureDate: Date; caption: string | null }[];
  athleteSleeperPlayerId: string | null;
};

/// Per-WAG profile detail. Includes the full Athlete linkage so the
/// profile page can cross-link back to /sports/mlf/players/[id] for
/// NFL athletes that have a Sleeper id.
export async function getWagProfile(slug: string): Promise<WagProfile | null> {
  const wag = await findWagBySlug(slug);
  if (!wag) return null;
  const [features, athlete] = await Promise.all([
    prisma.sportsWagFeature.findMany({
      where: { wagId: wag.id },
      orderBy: { featureDate: "desc" },
      select: { featureDate: true, caption: true },
    }),
    wag.athleteId
      ? prisma.athlete.findUnique({
          where: { id: wag.athleteId },
          select: { sleeperPlayerId: true },
        })
      : Promise.resolve(null),
  ]);
  return {
    wag,
    imageRenderUrl: resolveImageRenderUrl(wag),
    features,
    athleteSleeperPlayerId: athlete?.sleeperPlayerId ?? null,
  };
}

export type WagInsights = {
  totalWags: number;
  totalFeatures: number;
  bySport: { sport: SportTag; count: number }[];
  mostFeatured: {
    slug: string;
    name: string;
    sport: SportTag;
    count: number;
  }[];
};

export async function getWagInsights(): Promise<WagInsights> {
  const [bySport, totalFeatures, mostFeaturedRaw] = await Promise.all([
    prisma.sportsWag.groupBy({
      by: ["sport"],
      where: { hidden: false },
      _count: { _all: true },
    }),
    prisma.sportsWagFeature.count(),
    prisma.sportsWag.findMany({
      where: { hidden: false },
      include: { _count: { select: { features: true } } },
      orderBy: { features: { _count: "desc" } },
      take: 5,
    }),
  ]);
  const totalWags = bySport.reduce((acc, row) => acc + row._count._all, 0);
  return {
    totalWags,
    totalFeatures,
    bySport: bySport
      .map((row) => ({ sport: row.sport, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    mostFeatured: mostFeaturedRaw
      .filter((w) => w._count.features > 0)
      .map((w) => ({
        slug: wagSlug(w),
        name: w.name,
        sport: w.sport,
        count: w._count.features,
      })),
  };
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Strip combining marks so "Béyonce" → "beyonce". Keeps the slug
    // ASCII-safe for any non-Latin name we render in the future.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function resolveImageRenderUrl(wag: SportsWag): string {
  // Same logic as wag-rotation.resolveImageRenderUrl but local — we
  // can't import a non-exported helper. If we add a third caller this
  // gets hoisted into a shared utility.
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (wag.imageR2Key && base) {
    return `${base.replace(/\/+$/, "")}/${wag.imageR2Key}`;
  }
  return `/api/sports/wag/image?wagId=${encodeURIComponent(wag.id)}`;
}
