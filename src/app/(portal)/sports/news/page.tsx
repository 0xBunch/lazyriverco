import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SPORTS_NEWS_TAGS } from "@/lib/sports/news-tags";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const SPORT_FILTERS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const;

type SearchParams = {
  tag?: string;
  sport?: string;
  cursor?: string;
  msg?: string;
  error?: string;
};

export default async function SportsNewsIndex({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/start");

  const tagFilter = searchParams?.tag;
  const sportFilter = searchParams?.sport;
  const cursor = searchParams?.cursor;
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;

  // Keyset pagination on (publishedAt DESC, id DESC). Cursor encodes
  // both fields so ties on publishedAt don't cause page-edge drift.
  const cursorDecoded = decodeCursor(cursor);

  const where = {
    hidden: false,
    feed: { category: "SPORTS" as const, enabled: true },
    ...(tagFilter ? { tags: { has: tagFilter } } : {}),
    ...(sportFilter && SPORT_FILTERS.includes(sportFilter as (typeof SPORT_FILTERS)[number])
      ? { sport: sportFilter as (typeof SPORT_FILTERS)[number] }
      : {}),
    ...(cursorDecoded
      ? {
          OR: [
            { publishedAt: { lt: cursorDecoded.publishedAt } },
            {
              publishedAt: cursorDecoded.publishedAt,
              id: { lt: cursorDecoded.id },
            },
          ],
        }
      : {}),
  };

  const items = await prisma.newsItem.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    include: { feed: { select: { name: true } } },
  });

  const hasMore = items.length > PAGE_SIZE;
  const visible = items.slice(0, PAGE_SIZE);
  const nextCursor = hasMore && visible.length > 0
    ? encodeCursor(visible[visible.length - 1])
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      {flashMsg && (
        <p className="mb-4 rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-200">
          {flashMsg}
        </p>
      )}
      {flashError && (
        <p className="mb-4 rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-2 text-sm text-red-200">
          {flashError}
        </p>
      )}
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50 text-balance md:text-4xl">
          Sports news
        </h1>
        <p className="mt-2 text-sm text-bone-300 text-pretty">
          Headlines aggregated from the feeds tagged{" "}
          <code className="rounded bg-bone-900 px-1.5 py-0.5 text-bone-200">
            category=SPORTS
          </code>{" "}
          at{" "}
          <Link
            href="/admin/memory/feeds"
            className="text-claude-300 underline decoration-claude-700 underline-offset-2 hover:text-claude-200"
          >
            /admin/memory/feeds
          </Link>
          . Filter by tag or sport — tags are auto-applied at poll time
          from a keyword map.
        </p>
      </header>

      {/* Filter chips */}
      <div className="mb-6 space-y-3">
        <FilterRow
          label="Tag"
          options={["", ...SPORTS_NEWS_TAGS] as readonly string[]}
          selected={tagFilter ?? ""}
          buildHref={(v) =>
            buildFilterHref({ tag: v || undefined, sport: sportFilter })
          }
        />
        <FilterRow
          label="Sport"
          options={["", ...SPORT_FILTERS] as readonly string[]}
          selected={sportFilter ?? ""}
          buildHref={(v) =>
            buildFilterHref({ tag: tagFilter, sport: v || undefined })
          }
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-bone-800 bg-bone-950 p-8 text-center text-sm italic text-bone-400">
          No headlines match this filter yet.
        </p>
      ) : (
        <ul className="divide-y divide-bone-800/80 border-y border-bone-800/80">
          {visible.map((item) => (
            <li key={item.id}>
              <NewsCard
                item={{
                  id: item.id,
                  title: item.title,
                  excerpt: item.excerpt,
                  publishedAt: item.publishedAt,
                  ingestedAt: item.ingestedAt,
                  ogImageUrl: item.ogImageUrl,
                  feedName: item.feed.name,
                  tags: item.tags,
                  sport: item.sport,
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {(nextCursor || cursor) && (
        <nav className="mt-6 flex items-center justify-between text-sm">
          <Link
            href={buildFilterHref({ tag: tagFilter, sport: sportFilter })}
            className={
              cursor
                ? "rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-bone-100 hover:bg-bone-700"
                : "pointer-events-none opacity-30"
            }
            aria-disabled={!cursor}
          >
            ← Latest
          </Link>
          <Link
            href={
              nextCursor
                ? buildFilterHref({
                    tag: tagFilter,
                    sport: sportFilter,
                    cursor: nextCursor,
                  })
                : "#"
            }
            className={
              nextCursor
                ? "rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-bone-100 hover:bg-bone-700"
                : "pointer-events-none opacity-30"
            }
            aria-disabled={!nextCursor}
          >
            Older →
          </Link>
        </nav>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  selected,
  buildHref,
}: {
  label: string;
  options: readonly string[];
  selected: string;
  buildHref: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
        {label}
      </span>
      {options.map((opt) => {
        const isSelected = opt === selected;
        const display = opt === "" ? "All" : opt;
        return (
          <Link
            key={opt}
            href={buildHref(opt)}
            className={
              isSelected
                ? "rounded-full bg-claude-900 px-3 py-1 text-xs text-claude-100 ring-1 ring-claude-700"
                : "rounded-full bg-bone-900 px-3 py-1 text-xs text-bone-300 ring-1 ring-bone-800 hover:bg-bone-800 hover:text-bone-100"
            }
          >
            {display}
          </Link>
        );
      })}
    </div>
  );
}

function NewsCard({
  item,
}: {
  item: {
    id: string;
    title: string;
    excerpt: string | null;
    publishedAt: Date | null;
    ingestedAt: Date;
    ogImageUrl: string | null;
    feedName: string;
    tags: string[];
    sport: string | null;
  };
}) {
  const when = item.publishedAt ?? item.ingestedAt;
  return (
    <Link
      href={`/sports/news/${item.id}`}
      className="group -mx-2 flex items-start gap-4 rounded-sm px-2 py-5 transition-colors hover:bg-bone-900/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
    >
      <Thumbnail src={item.ogImageUrl} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
            {item.feedName}
          </span>
          <span aria-hidden="true" className="text-bone-700">·</span>
          <span className="tabular-nums text-bone-400">
            {formatRelative(when)}
          </span>
          {item.sport && <SportPill sport={item.sport} />}
        </div>
        <h2 className="font-display text-lg font-semibold leading-snug text-bone-50 text-balance group-hover:text-claude-100 md:text-xl">
          {item.title}
        </h2>
        {item.excerpt && (
          <p className="mt-2 hidden text-sm text-pretty text-bone-300 line-clamp-2 md:block">
            {item.excerpt}
          </p>
        )}
        {item.tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <li
                key={t}
                className="rounded-full bg-bone-900 px-2 py-0.5 text-[10px] tracking-widest text-bone-200 ring-1 ring-bone-700"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

function Thumbnail({ src }: { src: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className="aspect-[4/3] w-24 flex-shrink-0 rounded-sm object-cover ring-1 ring-bone-800 md:w-36"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="aspect-[4/3] w-24 flex-shrink-0 rounded-sm bg-gradient-to-br from-claude-900 to-bone-950 ring-1 ring-bone-800 md:w-36"
    />
  );
}

function SportPill({ sport }: { sport: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-bone-900 px-2 py-0.5 text-[10px] tracking-widest text-bone-200 ring-1 ring-bone-700">
      {sport}
    </span>
  );
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildFilterHref(params: {
  tag?: string;
  sport?: string;
  cursor?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.tag) sp.set("tag", params.tag);
  if (params.sport) sp.set("sport", params.sport);
  if (params.cursor) sp.set("cursor", params.cursor);
  const qs = sp.toString();
  return qs ? `/sports/news?${qs}` : "/sports/news";
}

function encodeCursor(item: { publishedAt: Date | null; id: string; ingestedAt: Date }): string {
  const t = (item.publishedAt ?? item.ingestedAt).getTime();
  return Buffer.from(`${t}:${item.id}`, "utf8").toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
): { publishedAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    const t = Number(decoded.slice(0, idx));
    const id = decoded.slice(idx + 1);
    if (!Number.isFinite(t) || !id) return null;
    return { publishedAt: new Date(t), id };
  } catch {
    return null;
  }
}
