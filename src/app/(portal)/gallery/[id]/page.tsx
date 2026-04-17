import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma, type $Enums } from "@prisma/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseVideoEmbed } from "@/lib/video-embed";
import { originLabel } from "@/lib/gallery-origin";
import { initialsOf } from "@/lib/initials";

// /gallery/[id] — gallery item detail.
//
// Shape (per design-oracle on the plan review):
//   1. Back nav
//   2. Eyebrow: origin + date + "View on [Source]"
//   3. Hero: image or embedded video iframe
//   4. Caption (markdown, prose)
//   5. Tag chips
//   6. Thread — the "this is *our* app" move. v1 minimum: agent references
//      + chat mentions (Messages whose content contains this item's
//      sourceUrl or mediaId). No reactions in v1 (locked with KB).
//
// The thread query does a LIKE scan over Message.content; at 7 users + a
// few hundred messages it's cheap. If this ever gets hot, denormalize
// into a (mediaId, messageId) join populated by a message-ingest hook.

export const dynamic = "force-dynamic";

type Params = { id: string };

// Single source of truth for the MediaOrigin enum — Prisma-generated.
type OriginKey = $Enums.MediaOrigin;

export default async function GalleryItemPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const viewer = await requireUser();

  const item = await prisma.media.findUnique({
    where: { id },
    include: {
      uploadedBy: {
        select: { id: true, displayName: true, avatarUrl: true, name: true },
      },
    },
  });

  // Hide DELETED from everyone except admin. Hidden-from-grid is still
  // reachable by direct id link — that's the "soft-hide" intent.
  if (!item) notFound();
  if (item.status === "DELETED" && viewer.role !== "ADMIN") notFound();

  const origin = item.origin;
  const video = origin === "YOUTUBE" ? parseVideoEmbed(item.sourceUrl) : null;
  const dateLabel = item.createdAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Thread query — find Messages that reference this media by sourceUrl
  // or id. Limit to READY-era messages; no special index needed at this
  // scale. Also exclude the current media row's caption from the search
  // (it's not a "thread" moment).
  const threadFilters: Prisma.MessageWhereInput[] = [
    { content: { contains: item.id } },
  ];
  if (item.sourceUrl) {
    threadFilters.push({ content: { contains: item.sourceUrl } });
  }
  const threadRows = await prisma.message.findMany({
    where: { OR: threadFilters },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      user: { select: { displayName: true, name: true, avatarUrl: true } },
      character: { select: { displayName: true, name: true, avatarUrl: true } },
      conversation: { select: { id: true } },
    },
  });

  const canHide = viewer.role === "ADMIN" || viewer.id === item.uploadedById;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pt-20 md:pt-8">
      <nav className="mb-6 text-xs uppercase tracking-[0.2em] text-bone-300">
        <Link
          href="/gallery"
          className="rounded transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
        >
          ← Gallery
        </Link>
      </nav>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
          {originLabel(origin)} · {dateLabel}
          {item.hallOfFame ? (
            <span className="ml-2 text-claude-200">· Hall of Fame</span>
          ) : null}
          {item.hiddenFromGrid ? (
            <span className="ml-2 text-bone-400">· Hidden from grid</span>
          ) : null}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-bone-50 text-balance">
          {item.originTitle ?? item.caption ?? "Shared on Lazy River"}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-bone-300">
          <UploaderLine uploader={item.uploadedBy} />
          {item.originAuthor ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {origin === "INSTAGRAM" ? "@" : ""}
                {item.originAuthor}
              </span>
            </>
          ) : null}
          {item.sourceUrl && item.origin !== "UPLOAD" ? (
            <>
              <span aria-hidden>·</span>
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm underline decoration-claude-500/40 underline-offset-2 hover:text-bone-50 hover:decoration-claude-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
              >
                View on {originLabel(origin)}
              </a>
            </>
          ) : null}
        </p>
      </header>

      {/* Hero. For YouTube prefer the iframe over the thumbnail so the
          user can watch inline. Everything else gets the biggest image
          we have. Tier-C items (origin=WEB with no image) fall through
          to just the uploader's caption. */}
      {video ? (
        <section className="mb-8">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-bone-900">
            <iframe
              src={video.iframeSrc}
              title={item.originTitle ?? "Embedded video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </section>
      ) : item.url ? (
        <figure className="mx-auto mb-8 overflow-hidden rounded-2xl bg-bone-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.caption ?? item.originTitle ?? "Shared photo"}
            className="h-auto w-full object-contain"
          />
        </figure>
      ) : null}

      {item.caption ? (
        <div className="prose prose-invert prose-sm mb-8 max-w-none prose-p:text-bone-200 prose-a:text-claude-300 prose-strong:text-bone-50">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.caption}</ReactMarkdown>
        </div>
      ) : null}

      {item.tags.length > 0 ? (
        <div className="mb-8 flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <Link
              key={tag}
              href={`/gallery?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-bone-900 px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-bone-200 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
            >
              #{tag}
            </Link>
          ))}
        </div>
      ) : null}

      <ThreadSection rows={threadRows} />

      {canHide ? (
        <p className="mt-12 text-xs italic text-bone-300">
          {viewer.role === "ADMIN"
            ? "Commissioner can bulk-hide or delete in /admin/gallery."
            : "You uploaded this. Admin tools coming soon for self-hide."}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function UploaderLine({
  uploader,
}: {
  uploader: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    name: string;
  };
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {uploader.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={uploader.avatarUrl}
          alt=""
          className="h-5 w-5 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bone-800 text-[9px] font-semibold text-bone-200">
          {initialsOf(uploader.displayName)}
        </span>
      )}
      <Link
        href={`/gallery?by=me`}
        className="rounded-sm text-bone-200 underline decoration-transparent underline-offset-2 hover:decoration-claude-500/40 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
      >
        {uploader.displayName} shared this
      </Link>
    </span>
  );
}

function ThreadSection({
  rows,
}: {
  rows: Array<{
    id: string;
    content: string;
    createdAt: Date;
    authorType: "USER" | "CHARACTER";
    conversation: { id: string } | null;
    user: { displayName: string; name: string; avatarUrl: string | null } | null;
    character:
      | { displayName: string; name: string; avatarUrl: string | null }
      | null;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <section className="mt-12 border-t border-bone-800 pt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-300">
          Thread
        </h2>
        <p className="text-sm italic text-bone-300">
          Nobody’s chimed in about this one yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-12 border-t border-bone-800 pt-6">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-claude-300">
        Thread
      </h2>
      <ul className="flex flex-col gap-4">
        {rows.map((m) => {
          const actor =
            m.authorType === "CHARACTER" ? m.character : m.user;
          const when = m.createdAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const conversationHref = m.conversation?.id
            ? `/chat/${m.conversation.id}`
            : null;
          const excerpt = truncate(m.content, 200);

          return (
            <li key={m.id} className="flex gap-3 text-sm">
              <div className="mt-0.5 shrink-0">
                {actor?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={actor.avatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bone-800 text-[10px] font-semibold text-bone-200">
                    {initialsOf(actor?.displayName ?? "?")}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-bone-300">
                  <span className="text-bone-200">
                    {actor?.displayName ?? "Unknown"}
                  </span>
                  {m.authorType === "CHARACTER" ? (
                    <span
                      aria-label="agent author"
                      className="ml-1 rounded bg-claude-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-claude-200"
                    >
                      Agent
                    </span>
                  ) : null}
                  <span className="mx-1.5 text-bone-500" aria-hidden>
                    ·
                  </span>
                  {conversationHref ? (
                    <Link
                      href={conversationHref}
                      className="rounded-sm hover:text-bone-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
                    >
                      {when}
                    </Link>
                  ) : (
                    <span>{when}</span>
                  )}
                </p>
                <p className="mt-1 text-bone-200 text-pretty">{excerpt}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}
