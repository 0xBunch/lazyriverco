import { SectionHeader } from "./SectionHeader";
import type { SportsHighlight } from "@prisma/client";

/// Highlights grid. Desktop: vertical stack of 6 video thumbnails in
/// the right rail. Mobile: horizontal scroll-snap row, 3 visible at
/// rest, all 6 swipeable.
///
/// Click → opens the YouTube video in a new tab. The plan calls for
/// an in-app modal lightbox, but that needs the existing portal modal
/// primitive verified for focus-trap a11y first. Deferred to a
/// follow-up commit; YouTube target="_blank" is the safe MVP.
export function HighlightsGrid({
  items,
  isAdmin,
}: {
  items: SportsHighlight[];
  isAdmin: boolean;
}) {
  return (
    <section>
      <div className="px-4 md:px-0">
        <SectionHeader
          label="Highlights · YouTube"
          srTitle="Sports highlights"
          trailing={
            isAdmin ? (
              <a
                href="/admin/sports/highlights"
                className="text-xs text-claude-300 transition-colors hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
              >
                Manage →
              </a>
            ) : null
          }
        />
      </div>
      {items.length === 0 ? (
        <div className="mx-4 mt-6 rounded-sm border border-dashed border-bone-800 p-6 text-sm text-bone-400 md:mx-0">
          {isAdmin
            ? "No highlights yet. Add one at /admin/sports/highlights."
            : "No highlights today."}
        </div>
      ) : (
        <ul
          // Mobile: horizontal snap row. Desktop: vertical stack.
          className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:flex-col md:gap-4 md:overflow-visible md:px-0"
          style={{ scrollPaddingLeft: "16px" }}
        >
          {items.map((item) => (
            <li
              key={item.id}
              className="flex-shrink-0 snap-start md:flex-shrink"
              style={{ width: "70%" }}
            >
              <HighlightCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HighlightCard({ item }: { item: SportsHighlight }) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${item.youtubeVideoId}`;
  return (
    <a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Play highlight: ${item.title}`}
      className="group block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
    >
      <span className="relative block aspect-video overflow-hidden rounded-sm bg-gradient-to-br from-claude-900 via-bone-900 to-bone-950 ring-1 ring-bone-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {item.durationSec != null ? (
          <span className="absolute bottom-2 right-2 rounded-sm bg-bone-950/80 px-2 py-0.5 text-[11px] tabular-nums text-bone-100">
            {formatDuration(item.durationSec)}
          </span>
        ) : null}
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-bone-950/60 text-bone-50 ring-1 ring-bone-50/30 transition-all group-hover:bg-claude-500/90 group-hover:ring-claude-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </span>
      <p className="mt-2.5 font-display text-sm font-semibold leading-snug text-bone-100 line-clamp-2 group-hover:text-claude-100">
        {item.title}
      </p>
      <p className="mt-1 text-xs tabular-nums text-bone-400">
        {item.sport} · {item.channel}
      </p>
    </a>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
