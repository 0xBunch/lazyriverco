import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { GalleryTile, type GalleryTileItem } from "@/components/GalleryTile";

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

  const items = await loadGalleryItems({
    q,
    tag,
    originFilter,
    byUserId,
    limit: GRID_LIMIT,
  });

  const hof = items.filter((m) => m.hallOfFame);
  const rest = items.filter((m) => !m.hallOfFame);
  const featuredHof = !hasAnyFilter ? hof.slice(0, 4) : [];
  const gridItems = hasAnyFilter ? items : rest.concat(hof.slice(4));

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
        {/* "+ Add" — parallel-route modal ships with todo #8. For now it
            stubs to a URL marker the future modal will read. */}
        <Link
          href="/gallery?add=1"
          className="inline-flex items-center justify-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-200 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        >
          + Add
        </Link>
      </header>

      <form
        action="/gallery"
        method="get"
        role="search"
        className="mb-4 flex gap-2"
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
          className="flex-1 rounded-md border border-bone-800/60 bg-bone-900/40 px-3 py-2 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none"
        />
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        {by ? <input type="hidden" name="by" value={by} /> : null}
        {originFilter ? (
          <input type="hidden" name="origin" value={originFilter} />
        ) : null}
        <button
          type="submit"
          className="rounded-md border border-bone-800/60 bg-bone-900/40 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-bone-200 transition-colors hover:text-bone-50"
        >
          Search
        </button>
      </form>

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
    </div>
  );
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
  // directly. Step 1 gets ranked ids from the GIN index; step 2 hydrates
  // the relational data and re-sorts by rank.
  const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Media"
    WHERE status = 'READY'::"MediaStatus"
      AND "hiddenFromGrid" = false
      AND media_search_tsv("caption", "originTitle", "originAuthor", "tags")
          @@ plainto_tsquery('english', ${p.q})
    ORDER BY "hallOfFame" DESC, "createdAt" DESC
    LIMIT ${p.limit}
  `;
  if (idRows.length === 0) return [];
  const ids = idRows.map((r) => r.id);
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
      <span className="uppercase tracking-[0.2em] text-bone-400">Filters</span>
      {chips.map((c) => (
        <Link
          key={c.label}
          href={c.clearHref}
          className="inline-flex items-center gap-1.5 rounded-full border border-bone-800/60 bg-bone-900/40 px-3 py-1 text-bone-200 transition-colors hover:text-bone-50"
        >
          <span>{c.label}</span>
          <span aria-hidden className="text-bone-500">×</span>
          <span className="sr-only">Remove filter</span>
        </Link>
      ))}
      <Link
        href="/gallery"
        className="text-bone-300 underline decoration-claude-500/40 underline-offset-2 hover:text-bone-50"
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
          className="underline decoration-claude-500/40 underline-offset-2 hover:text-bone-100"
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
        className="mt-4 inline-flex items-center justify-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-200 hover:bg-claude-500/20"
      >
        Drop the first one
      </Link>
    </div>
  );
}
