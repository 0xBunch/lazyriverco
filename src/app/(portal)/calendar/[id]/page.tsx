import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseVideoEmbed } from "@/lib/video-embed";

// Event detail page. Route: /calendar/[id]
//
// Separation of concerns:
//   - description (short) = the agent-context summary; NOT shown here.
//   - body (markdown)     = the long-form "what happened / what's planned"
//                           that members read when they click through.
//
// A recurring birthday entry doesn't currently embed the year in the URL —
// we show the one canonical entry and let the grid chip context supply
// "which year's occurrence." If we ever want per-occurrence galleries
// (2024 trip vs 2025 trip under one entry), we'd refactor into
// /calendar/[id]/[year], but that's overbuilding for v1.

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function CalendarEntryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;

  const entry = await prisma.calendarEntry.findUnique({
    where: { id },
    include: {
      media: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          media: {
            select: {
              id: true,
              url: true,
              mimeType: true,
              caption: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!entry) notFound();

  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  // Only READY media surfaces on the detail page. PENDING = upload in
  // progress or abandoned; DELETED = soft-removed. Either way, not here.
  const attachments = entry.media.filter((a) => a.media.status === "READY");
  const cover = attachments.find((a) => a.isCover) ?? attachments[0] ?? null;
  const galleryAttachments = attachments.filter((a) => a !== cover);

  const video = parseVideoEmbed(entry.videoEmbedUrl);

  // Format the date human-readably in the server's locale. Using toLocaleDateString
  // with explicit options rather than date-fns to avoid pulling a formatter for
  // a single string.
  const dateLabel = new Date(entry.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pt-20 md:pt-8">
      <nav className="mb-6 text-xs uppercase tracking-[0.2em] text-bone-300">
        <Link
          href="/calendar"
          className="rounded transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
        >
          ← Calendar
        </Link>
      </nav>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
          {dateLabel}
          {entry.recurrence === "annual" ? (
            <span className="ml-2 text-bone-300">· Annual</span>
          ) : null}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-bone-50">
          {entry.title}
        </h1>

        {entry.description ? (
          <p className="mt-3 max-w-2xl text-sm italic text-bone-300">
            {entry.description}
          </p>
        ) : null}

        {/* Tags moved below the body (see footer strip) per design-oracle:
            metadata shouldn't interrupt eyebrow → title → dek → cover. */}

        {isAdmin ? (
          <Link
            href="/admin/calendar"
            className="mt-4 inline-block rounded text-xs font-semibold uppercase tracking-[0.2em] text-claude-300 transition-colors hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
          >
            Edit in Commissioner Room →
          </Link>
        ) : null}
      </header>

      {/* Cover image — constrained to max-w-3xl so the h1 keeps its hero
          position (per design-oracle: a full-width cover directly under
          a 30px title makes the eye race between them). Caption moved to
          a hover/focus overlay to avoid inline caption noise. */}
      {cover ? (
        <figure className="mx-auto mb-8 max-w-3xl overflow-hidden rounded-2xl bg-bone-900">
          <div className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.media.url}
              alt={cover.caption ?? cover.media.caption ?? entry.title}
              className="h-auto w-full object-cover"
            />
            {cover.caption || cover.media.caption ? (
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bone-950/90 to-transparent px-4 pb-3 pt-10 text-xs italic text-bone-100 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                {cover.caption ?? cover.media.caption}
              </figcaption>
            ) : null}
          </div>
        </figure>
      ) : null}

      {entry.body ? (
        <div className="prose prose-invert prose-sm mb-8 max-w-none prose-headings:font-display prose-headings:text-bone-50 prose-p:text-bone-200 prose-a:text-claude-300 prose-strong:text-bone-50 prose-code:text-bone-100 prose-code:bg-bone-900 prose-code:rounded prose-code:px-1 prose-code:py-0.5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>
        </div>
      ) : null}

      {video ? (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300">
            Watch
          </h2>
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-bone-900">
            <iframe
              src={video.iframeSrc}
              title={`${entry.title} — ${video.provider} embed`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </section>
      ) : null}

      {galleryAttachments.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300">
            Gallery
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {galleryAttachments.map((a, i) => {
              const caption = a.caption ?? a.media.caption;
              // Positional alt fallback so the link has an accessible name
              // even when no caption exists (a11y review, 2.4.4).
              const altText = caption ?? `Photo ${i + 1}`;
              return (
                <li
                  key={a.id}
                  className="overflow-hidden rounded-lg bg-bone-900"
                >
                  <a
                    href={a.media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={caption ?? `Open photo ${i + 1} in new tab`}
                    className="group relative block overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.media.url}
                      alt={altText}
                      className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
                    />
                    {caption ? (
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bone-950/90 to-transparent px-2 pb-1.5 pt-6 text-[0.7rem] italic text-bone-100 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                        {caption}
                      </span>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {entry.tags.length > 0 ? (
        <footer className="mt-8 border-t border-bone-800 pt-4">
          <ul className="flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-bone-900 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-bone-200"
              >
                #{tag}
              </li>
            ))}
          </ul>
        </footer>
      ) : null}

      {!cover && !entry.body && !video && galleryAttachments.length === 0 ? (
        <p className="text-sm italic text-bone-300">
          No details added yet.
          {isAdmin ? " Head to the Commissioner Room to add photos or a write-up." : ""}
        </p>
      ) : null}
    </div>
  );
}
