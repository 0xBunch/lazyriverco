import { SectionHeader } from "./SectionHeader";

/// Headlines rail. Renders 8 cards on desktop, 4 on mobile (rest hidden
/// via `md:` reveal). Each card has a thumbnail (OG image when
/// available, gradient placeholder otherwise), source pill, sport tag
/// pill, relative timestamp, headline, and 2-line excerpt.
///
/// Reads from the shipped NewsItem table where the parent feed has
/// category=SPORTS. Empty state explains how to seed feeds — admin
/// sees the helpful pointer; non-admin gets the quiet "no headlines
/// yet" line.
export type HeadlineItem = {
  id: string;
  title: string;
  excerpt: string | null;
  originalUrl: string;
  publishedAt: Date | null;
  ingestedAt: Date;
  ogImageUrl: string | null;
  sport: string | null;
  feedName: string;
};

export function HeadlinesRail({
  items,
  isAdmin,
}: {
  items: HeadlineItem[];
  isAdmin: boolean;
}) {
  return (
    <section>
      <SectionHeader
        label="Headlines · Curated"
        srTitle="Sports headlines"
        trailing={
          isAdmin ? (
            <a
              href="/admin/memory/feeds"
              className="text-xs text-claude-300 transition-colors hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Manage feeds →
            </a>
          ) : null
        }
      />
      {items.length === 0 ? (
        <div className="mt-6 rounded-sm border border-dashed border-bone-800 p-6 text-sm text-bone-400">
          {isAdmin ? (
            <>
              No sports headlines yet. Configure a feed at{" "}
              <a
                href="/admin/memory/feeds"
                className="text-claude-300 underline decoration-claude-700 underline-offset-4 hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
              >
                /admin/memory/feeds
              </a>{" "}
              with <code className="rounded bg-bone-900 px-1.5 py-0.5 text-bone-200">category=SPORTS</code>{" "}
              and a sport tag — items poll on the next cron tick.
            </>
          ) : (
            "No sports headlines today."
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-bone-800/80 border-y border-bone-800/80">
          {items.map((item, i) => (
            <li
              key={item.id}
              // Items 5-8 hidden on mobile.
              className={i >= 4 ? "hidden md:block" : ""}
            >
              <HeadlineCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HeadlineCard({ item }: { item: HeadlineItem }) {
  const when = item.publishedAt ?? item.ingestedAt;
  const relative = formatRelative(when);
  return (
    <a
      href={item.originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group -mx-2 flex items-start gap-3 rounded-sm px-2 py-4 transition-colors hover:bg-bone-900/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 md:gap-5 md:py-5"
    >
      <Thumbnail src={item.ogImageUrl} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 md:mb-1.5 md:gap-2">
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
            {item.feedName}
          </span>
          <span aria-hidden="true" className="text-bone-700">
            ·
          </span>
          <span className="text-[11px] tabular-nums text-bone-400 md:text-xs">
            {relative}
          </span>
          {item.sport ? (
            <span className="ml-1 inline-flex items-center rounded-full bg-bone-900 px-1.5 py-0.5 text-[9px] tracking-widest text-bone-200 ring-1 ring-bone-700 md:px-2 md:text-[10px]">
              {item.sport}
            </span>
          ) : null}
        </div>
        <h3 className="font-display text-sm font-semibold text-balance leading-snug text-bone-50 group-hover:text-claude-100 md:text-lg lg:text-xl">
          {item.title}
        </h3>
        {item.excerpt ? (
          <p className="mt-2 hidden text-sm text-pretty text-bone-300 line-clamp-2 md:block">
            {item.excerpt}
          </p>
        ) : null}
      </div>
    </a>
  );
}

function Thumbnail({ src }: { src: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        className="aspect-[4/3] w-20 flex-shrink-0 rounded-sm object-cover ring-1 ring-bone-800 md:w-32"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="aspect-[4/3] w-20 flex-shrink-0 rounded-sm bg-gradient-to-br from-claude-900 to-bone-950 ring-1 ring-bone-800 md:w-32"
    />
  );
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  const minutes = Math.max(1, Math.round((now - then) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
