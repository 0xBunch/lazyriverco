import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { searchGalleryIds } from "@/lib/gallery-search";
import { GalleryTile, type GalleryTileItem } from "@/components/GalleryTile";
import { GalleryAddModal } from "@/components/GalleryAddModal";
import {
  GalleryFilterSheet,
  type GalleryMember,
} from "@/components/GalleryFilterSheet";

// /gallery — the shared visual bank. Every signed-in member sees the same
// feed (no per-item privacy; the point is sharing). URL params drive all
// state so the page is SSR-only, cache-friendly, and shareable:
//   ?q=keyword   full-text search across caption + origin* + tags
//   ?tag=slug    tag filter (exact match, lowercased)
//   ?by=me       uploader filter — "me" = current session user
//   ?origin=...  MediaOrigin enum filter (UPLOAD/YOUTUBE/X/INSTAGRAM/WEB)
// Hall of Fame items get a featured hero row ONLY on the default view
// (no active filter); when filtering, the grid is flat so the filter
// predicate isn't second-guessed by the UX.

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  tag?: string;
  by?: string;
  origin?: string;
  /** ?add=1 opens the add modal (client component renders it). */
  add?: string;
  /** ?filter=1 opens the filter sheet. */
  filter?: string;
};

const KNOWN_ORIGINS = new Set<string>([
  "UPLOAD",
  "INSTAGRAM",
  "YOUTUBE",
  "X",
  "WEB",
]);

// Cap the grid size at a sensible number — 7 users sharing weekly for
// years still doesn't fill this page, but FTS + Prisma queries stay quick.
const GRID_LIMIT = 120;

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const q = normalizeQuery(params.q);
  const tag = normalizeTag(params.tag);
  const originFilter = KNOWN_ORIGINS.has(params.origin ?? "")
    ? (params.origin as GalleryTileItem["origin"])
    : null;
  const by = (params.by ?? "").trim();
  const byUserId = by === "me" ? user.id : null;
  const hasAnyFilter = Boolean(q || tag || byUserId || originFilter);

  const [items, allTags, allMembers] = await Promise.all([
    loadGalleryItems({
      q,
      tag,
      originFilter,
      byUserId,
      limit: GRID_LIMIT,
    }),
    loadDistinctTags(),
    loadMembers(),
  ]);

  const hof = items.filter((m) => m.hallOfFame);
  const rest = items.filter((m) => !m.hallOfFame);
  const featuredHof = !hasAnyFilter ? hof.slice(0, 4) : [];
  const gridItems = hasAnyFilter ? items : rest.concat(hof.slice(4));

  const addOpen = params.add === "1";
  const filterOpen = params.filter === "1";
  const activeFilterCount =
    (tag ? 1 : 0) + (originFilter ? 1 : 0) + (byUserId ? 1 : 0);
  const filterSheetHref = buildFilterSheetHref({
    q,
    tag,
    origin: originFilter,
    byUserId,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pt-20 md:pt-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
            Gallery
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50 text-balance">
            The wall
          </h1>
        </div>
        {/* "+ Add" → opens GalleryAddModal via ?add=1. */}
        <Link
          href="/gallery?add=1"
          className="inline-flex items-center justify-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-200 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
        >
          + Add
        </Link>
      </header>

      <div className="mb-4 flex gap-2">
        <form
          action="/gallery"
          method="get"
          role="search"
          className="flex flex-1 gap-2"
        >
          <label htmlFor="gallery-q" className="sr-only">
            Search the gallery
          </label>
          <input
            id="gallery-q"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search captions, tags, titles…"
            className="flex-1 rounded-md border border-bone-800/60 bg-bone-900/40 px-3 py-2 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          />
          {/* Preserve the other filters across search submits. */}
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          {by ? <input type="hidden" name="by" value={by} /> : null}
          {originFilter ? (
            <input type="hidden" name="origin" value={originFilter} />
          ) : null}
          <button
            type="submit"
            className="rounded-md border border-bone-800/60 bg-bone-900/40 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
          >
            Search
          </button>
        </form>
        <Link
          href={filterSheetHref}
          aria-label={
            activeFilterCount > 0
              ? `Filters (${activeFilterCount} active)`
              : "Open filters"
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-bone-800/60 bg-bone-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
        >
          Filters
          {activeFilterCount > 0 ? (
            <span
              aria-hidden
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-claude-500/30 px-1.5 text-[10px] text-claude-100"
            >
              {activeFilterCount}
            </span>
          ) : null}
        </Link>
      </div>

      {hasAnyFilter ? (
        <ActiveFilters
          q={q}
          tag={tag}
          origin={originFilter}
          byMe={Boolean(byUserId)}
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyState filtered={hasAnyFilter} />
      ) : (
        <>
          {featuredHof.length > 0 ? (
            <section className="mb-8" aria-labelledby="gallery-hof">
              <h2
                id="gallery-hof"
                className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-claude-300"
              >
                Hall of Fame
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {featuredHof.map((item) => (
                  <GalleryTile key={item.id} item={item} featured />
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gridItems.map((item) => (
              <GalleryTile key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      <GalleryAddModal open={addOpen} />
      <GalleryFilterSheet
        open={filterOpen}
        allTags={allTags}
        allMembers={allMembers}
        viewerId={user.id}
        current={{
          q,
          tag,
          origin: originFilter,
          byUserId,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distinct tags + members for the filter sheet

async function loadDistinctTags(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ tag: string }>>`
    SELECT DISTINCT unnest(tags) AS tag
    FROM "Media"
    WHERE status = 'READY'::"MediaStatus" AND "hiddenFromGrid" = false
    ORDER BY tag ASC
  `;
  return rows.map((r) => r.tag);
}

async function loadMembers(): Promise<GalleryMember[]> {
  return prisma.user.findMany({
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
}

function buildFilterSheetHref(active: {
  q: string | null;
  tag: string | null;
  origin: GalleryTileItem["origin"] | null;
  byUserId: string | null;
}): string {
  const sp = new URLSearchParams();
  if (active.q) sp.set("q", active.q);
  if (active.tag) sp.set("tag", active.tag);
  if (active.origin) sp.set("origin", active.origin);
  if (active.byUserId) sp.set("by", "me");
  sp.set("filter", "1");
  return `/gallery?${sp.toString()}`;
}

// ---------------------------------------------------------------------------
// Data loading

type LoadParams = {
  q: string | null;
  tag: string | null;
  originFilter: GalleryTileItem["origin"] | null;
  byUserId: string | null;
  limit: number;
};

async function loadGalleryItems(p: LoadParams): Promise<GalleryTileItem[]> {
  const baseWhere: Prisma.MediaWhereInput = {
    status: "READY",
    hiddenFromGrid: false,
    ...(p.originFilter ? { origin: p.originFilter } : {}),
    ...(p.byUserId ? { uploadedById: p.byUserId } : {}),
    ...(p.tag ? { tags: { has: p.tag } } : {}),
  };

  const include = {
    uploadedBy: {
      select: { id: true, displayName: true, avatarUrl: true, name: true },
    },
  } as const;

  if (!p.q) {
    const rows = await prisma.media.findMany({
      where: baseWhere,
      orderBy: [{ hallOfFame: "desc" }, { createdAt: "desc" }],
      include,
      take: p.limit,
    });
    return rows.map(rowToTile);
  }

  // FTS path: two-step because Prisma can't express the tsvector match
  // directly. searchGalleryIds owns the raw SQL (shared with the agent
  // tool); this path just applies additional WHERE predicates on top
  // and re-sorts by rank.
  const ids = await searchGalleryIds(p.q, p.limit);
  if (ids.length === 0) return [];
  const rows = await prisma.media.findMany({
    where: { ...baseWhere, id: { in: ids } },
    include,
  });
  const rank = new Map(ids.map((id, i) => [id, i] as const));
  rows.sort(
    (a, b) =>
      (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length),
  );
  return rows.map(rowToTile);
}

function rowToTile(
  row: Awaited<ReturnType<typeof prisma.media.findMany>>[number] & {
    uploadedBy: GalleryTileItem["uploadedBy"];
  },
): GalleryTileItem {
  return {
    id: row.id,
    url: row.url,
    ogImageUrl: row.ogImageUrl,
    origin: row.origin as GalleryTileItem["origin"],
    type: row.type,
    caption: row.caption,
    sourceUrl: row.sourceUrl,
    originTitle: row.originTitle,
    originAuthor: row.originAuthor,
    hallOfFame: row.hallOfFame,
    createdAt: row.createdAt,
    uploadedBy: row.uploadedBy,
  };
}

// ---------------------------------------------------------------------------
// Query-param normalization — keep attacker-shaped input out of DB / UI

function normalizeQuery(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  return trimmed;
}

function normalizeTag(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().slice(0, 40);
  if (cleaned.length === 0) return null;
  if (!/^[a-z0-9][a-z0-9\-_]*$/.test(cleaned)) return null;
  return cleaned;
}

// ---------------------------------------------------------------------------
// Active filter chip row

function ActiveFilters({
  q,
  tag,
  origin,
  byMe,
}: {
  q: string | null;
  tag: string | null;
  origin: GalleryTileItem["origin"] | null;
  byMe: boolean;
}) {
  const chips: Array<{ label: string; clearHref: string }> = [];
  if (q) chips.push({ label: `"${q}"`, clearHref: hrefWithout({ q: null, tag, origin, byMe }) });
  if (tag) chips.push({ label: `#${tag}`, clearHref: hrefWithout({ q, tag: null, origin, byMe }) });
  if (origin)
    chips.push({
      label: originLabel(origin),
      clearHref: hrefWithout({ q, tag, origin: null, byMe }),
    });
  if (byMe)
    chips.push({
      label: "My uploads",
      clearHref: hrefWithout({ q, tag, origin, byMe: false }),
    });

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
      <span className="uppercase tracking-[0.2em] text-bone-300">Filters</span>
      {chips.map((c) => (
        <Link
          key={c.label}
          href={c.clearHref}
          className="inline-flex items-center gap-1.5 rounded-full border border-bone-800/60 bg-bone-900/40 px-3 py-2 text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
        >
          <span>{c.label}</span>
          <span aria-hidden className="text-bone-400">×</span>
          <span className="sr-only">Remove filter</span>
        </Link>
      ))}
      <Link
        href="/gallery"
        className="rounded-sm text-bone-300 underline decoration-claude-500/40 underline-offset-2 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
      >
        Clear all
      </Link>
    </div>
  );
}

function hrefWithout(active: {
  q: string | null;
  tag: string | null;
  origin: GalleryTileItem["origin"] | null;
  byMe: boolean;
}): string {
  const sp = new URLSearchParams();
  if (active.q) sp.set("q", active.q);
  if (active.tag) sp.set("tag", active.tag);
  if (active.origin) sp.set("origin", active.origin);
  if (active.byMe) sp.set("by", "me");
  const qs = sp.toString();
  return qs ? `/gallery?${qs}` : "/gallery";
}

function originLabel(o: GalleryTileItem["origin"]): string {
  switch (o) {
    case "UPLOAD":
      return "Uploads";
    case "YOUTUBE":
      return "YouTube";
    case "INSTAGRAM":
      return "Instagram";
    case "X":
      return "X";
    case "WEB":
      return "Web";
    default:
      return o;
  }
}

// ---------------------------------------------------------------------------
// Empty state

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <p className="mt-12 text-center text-sm italic text-bone-300">
        No matches.{" "}
        <Link
          href="/gallery"
          className="rounded-sm underline decoration-claude-500/40 underline-offset-2 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
        >
          Clear filters
        </Link>{" "}
        to see everything.
      </p>
    );
  }
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <p className="text-sm italic text-bone-300 text-balance">
        Blackie, KB, someone — start the wall.
      </p>
      <Link
        href="/gallery?add=1"
        className="mt-4 inline-flex items-center justify-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-200 hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
      >
        Drop the first one
      </Link>
    </div>
  );
}
