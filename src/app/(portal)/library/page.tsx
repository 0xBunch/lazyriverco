import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { searchLibraryIds } from "@/lib/library-search";
import { originLabel } from "@/lib/library-origin";
import { buildLibraryHref } from "@/lib/library-url";
import { LibraryTile, type LibraryTileItem } from "@/components/LibraryTile";
import { LibraryAddModal } from "@/components/LibraryAddModal";
import {
  LibraryFilterSheet,
  type LibraryMember,
} from "@/components/LibraryFilterSheet";

// /library — the shared visual bank. Every signed-in member sees the same
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

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const q = normalizeQuery(params.q);
  const tag = normalizeTag(params.tag);
  const originFilter = KNOWN_ORIGINS.has(params.origin ?? "")
    ? (params.origin as LibraryTileItem["origin"])
    : null;
  const by = (params.by ?? "").trim();
  const byUserId = by === "me" ? user.id : null;
  const hasAnyFilter = Boolean(q || tag || byUserId || originFilter);

  const [items, allTags, allMembers] = await Promise.all([
    loadLibraryItems({
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
  const filterSheetHref = buildLibraryHref(
    { q, tag, origin: originFilter, byUserId },
    { openFilter: true },
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pt-20 md:pt-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
            Library
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50 text-balance">
            Latest
          </h1>
        </div>
        {/* "+ Add" → opens LibraryAddModal via ?add=1. */}
        <Link
          href="/library?add=1"
          className="inline-flex items-center justify-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-200 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
        >
          + Add
        </Link>
      </header>

      <div className="mb-4 flex gap-2">
        <form
          action="/library"
          method="get"
          role="search"
          className="flex flex-1 gap-2"
        >
          <label htmlFor="library-q" className="sr-only">
            Search the library
          </label>
          <input
            id="library-q"
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
            <section className="mb-8" aria-labelledby="library-hof">
              <h2
                id="library-hof"
                className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-claude-300"
              >
                Hall of Fame
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {featuredHof.map((item) => (
                  <LibraryTile key={item.id} item={item} featured />
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gridItems.map((item) => (
              <LibraryTile key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      <LibraryAddModal open={addOpen} />
      <LibraryFilterSheet
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

async function loadMembers(): Promise<LibraryMember[]> {
  return prisma.user.findMany({
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Data loading

type LoadParams = {
  q: string | null;
  tag: string | null;
  originFilter: LibraryTileItem["origin"] | null;
  byUserId: string | null;
  limit: number;
};

async function loadLibraryItems(p: LoadParams): Promise<LibraryTileItem[]> {
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
  // directly. searchLibraryIds owns the raw SQL (shared with the agent
  // tool); this path just applies additional WHERE predicates on top
  // and re-sorts by rank.
  const ids = await searchLibraryIds(p.q, p.limit);
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
    uploadedBy: LibraryTileItem["uploadedBy"];
  },
): LibraryTileItem {
  // No cast on `origin` any more — LibraryTileItem["origin"] is the
  // Prisma enum itself, so row.origin flows through structurally.
  return {
    id: row.id,
    url: row.url,
    ogImageUrl: row.ogImageUrl,
    origin: row.origin,
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
  origin: LibraryTileItem["origin"] | null;
  byMe: boolean;
}) {
  const hrefFor = (partial: {
    q: string | null;
    tag: string | null;
    origin: LibraryTileItem["origin"] | null;
    byMe: boolean;
  }) =>
    buildLibraryHref({
      q: partial.q,
      tag: partial.tag,
      origin: partial.origin,
      byUserId: partial.byMe ? "me" : null,
    });

  const chips: Array<{ label: string; clearHref: string }> = [];
  if (q) chips.push({ label: `"${q}"`, clearHref: hrefFor({ q: null, tag, origin, byMe }) });
  if (tag) chips.push({ label: `#${tag}`, clearHref: hrefFor({ q, tag: null, origin, byMe }) });
  if (origin)
    chips.push({
      label: originLabel(origin),
      clearHref: hrefFor({ q, tag, origin: null, byMe }),
    });
  if (byMe)
    chips.push({
      label: "My uploads",
      clearHref: hrefFor({ q, tag, origin, byMe: false }),
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
        href="/library"
        className="rounded-sm text-bone-300 underline decoration-claude-500/40 underline-offset-2 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
      >
        Clear all
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <p className="mt-12 text-center text-sm italic text-bone-300">
        No matches.{" "}
        <Link
          href="/library"
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
        href="/library?add=1"
        className="mt-4 inline-flex items-center justify-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-200 hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
      >
        Drop the first one
      </Link>
    </div>
  );
}
