import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ingestAndSaveUrlAction } from "@/app/(portal)/library/actions";
import { PopupDone, PopupError, PopupViewInOpener } from "./_popup";

// /library/share — minimum-click ingest handler. Entry point for:
//   - PWA share_target (iOS/Android share sheet "Lazy River")
//   - Desktop bookmarklet (window.open with ?popup=1)
//
// Two modes:
//   popup=1  → the bookmarklet opened a small window. Render a compact
//              success card (thumbnail + origin + title + Close) INSIDE
//              the popup instead of navigating to /library/<id>, which
//              would crop badly inside 560x380.
//   default  → PWA share target / anything else. Redirect to the new
//              item's detail page. On mobile the detail page IS the
//              natural landing.
//
// Auth: lives inside (portal)/ so middleware.ts enforces the session
// cookie presence check. Crypto verification happens inside
// ingestAndSaveUrlAction → requireUser(). Unauthed visitors get
// redirected to /start per standard middleware behavior.

type ShareSearchParams = {
  url?: string | string[];
  title?: string | string[];
  text?: string | string[];
  popup?: string | string[];
};

export const dynamic = "force-dynamic";

export default async function LibraryShare({
  searchParams,
}: {
  searchParams: Promise<ShareSearchParams>;
}) {
  const params = await searchParams;
  const rawUrl = firstString(params.url);
  const rawTitle = firstString(params.title);
  const rawText = firstString(params.text);
  const isPopup = firstString(params.popup) === "1";

  const resolvedUrl = rawUrl?.trim() || extractUrl(rawText);

  if (!resolvedUrl) {
    return (
      <EmptyState
        hasText={Boolean(rawText?.trim())}
        sharedText={rawText}
        isPopup={isPopup}
      />
    );
  }

  const caption = (rawTitle ?? "").trim();
  const result = await ingestAndSaveUrlAction({
    url: resolvedUrl,
    caption,
    tags: "",
  });

  if (result.ok) {
    if (isPopup) {
      // Fetch just the fields the success card renders. Separate query
      // from the ingest so the action stays single-purpose; the read is
      // already-indexed-by-id and trivial.
      const media = await prisma.media.findUnique({
        where: { id: result.mediaId },
        select: {
          id: true,
          url: true,
          thumbnailUrl: true,
          ogImageUrl: true,
          origin: true,
          originTitle: true,
          caption: true,
          sourceUrl: true,
        },
      });
      if (!media) {
        // Shouldn't happen (we just created it), but fail graceful.
        return (
          <ErrorState
            error="Saved, but preview unavailable."
            url={resolvedUrl}
            isPopup
          />
        );
      }
      return <PopupSuccess media={media} />;
    }
    // Next's redirect() throws NEXT_REDIRECT; the framework intercepts
    // and returns a 302 to the item detail page. Rendering never
    // completes past this line.
    redirect(`/library/${result.mediaId}`);
  }

  return (
    <ErrorState error={result.error} url={resolvedUrl} isPopup={isPopup} />
  );
}

// ---------------------------------------------------------------------------

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

// Pull the first http(s) URL out of free text. Used when iOS Safari
// shares land in `text` rather than `url`. Intentionally simple: match
// a scheme + non-whitespace body, trim trailing punctuation that tends
// to cling to URLs in messages ("check this https://example.com!").
function extractUrl(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.match(/https?:\/\/\S+/i);
  if (!m) return undefined;
  return m[0].replace(/[)\].,!?;:"']+$/u, "");
}

// ---------------------------------------------------------------------------
// Popup success card — rendered only when isPopup + save succeeded.

type PopupMedia = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  ogImageUrl: string | null;
  origin: "UPLOAD" | "YOUTUBE" | "X" | "INSTAGRAM" | "WEB";
  originTitle: string | null;
  caption: string | null;
  sourceUrl: string | null;
};

function PopupSuccess({ media }: { media: PopupMedia }) {
  const title =
    (media.caption?.trim() || media.originTitle?.trim()) ?? fallbackTitle(media);
  const thumb = media.thumbnailUrl || media.url || media.ogImageUrl || null;
  const originLabel = ORIGIN_LABELS[media.origin] ?? "Link";

  return (
    <PopupShell>
      <div className="flex flex-col items-center">
        <SuccessCheck />
        <h1 className="mt-4 text-balance text-center font-display text-xl font-semibold tracking-tight text-bone-50">
          Saved to your library
        </h1>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-bone-800 bg-bone-900/40 p-3">
        <Thumb src={thumb} origin={media.origin} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-pretty text-sm font-medium text-bone-50">
            {title}
          </p>
          <p className="mt-1 text-xs text-bone-300">
            <span className="sr-only">Source: </span>
            {originLabel}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <PopupViewInOpener mediaId={media.id} />
        <PopupDone />
      </div>
    </PopupShell>
  );
}

function Thumb({
  src,
  origin,
}: {
  src: string | null;
  origin: PopupMedia["origin"];
}) {
  if (src) {
    return (
      // alt="" is intentional: the title+origin-tag immediately adjacent
      // already name the item, so the thumbnail is decorative for AT.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-16 w-16 flex-shrink-0 rounded-md border border-bone-800 object-cover"
      />
    );
  }
  // Link-only items (no preview image) get an origin glyph tile so the
  // row layout stays consistent. Stylized approximations — not platform
  // marks — to stay trademark-clean.
  return (
    <div
      aria-hidden="true"
      className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md border border-bone-800 bg-bone-900 text-claude-200"
    >
      <OriginGlyph origin={origin} />
    </div>
  );
}

function OriginGlyph({ origin }: { origin: PopupMedia["origin"] }) {
  switch (origin) {
    case "YOUTUBE":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect
            x="2.5"
            y="5.5"
            width="19"
            height="13"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M10 9.5v5l5-2.5-5-2.5z" fill="currentColor" />
        </svg>
      );
    case "X":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "INSTAGRAM":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="16.5" cy="7.5" r="0.9" fill="currentColor" />
        </svg>
      );
    case "UPLOAD":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 15V4M7 9l5-5 5 5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      // WEB + any unknown origin. Paper-clip / chain link.
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function SuccessCheck() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-claude-500/40 bg-claude-500/15 text-claude-100"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12l4 4 10-10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const ORIGIN_LABELS: Record<PopupMedia["origin"], string> = {
  UPLOAD: "Upload",
  YOUTUBE: "YouTube",
  X: "X",
  INSTAGRAM: "Instagram",
  WEB: "Web",
};

function fallbackTitle(media: PopupMedia): string {
  try {
    if (media.sourceUrl) return new URL(media.sourceUrl).hostname;
  } catch {
    /* not a valid URL — fall through */
  }
  return "Saved item";
}

// ---------------------------------------------------------------------------

function EmptyState({
  hasText,
  sharedText,
  isPopup,
}: {
  hasText: boolean;
  sharedText: string | undefined;
  isPopup: boolean;
}) {
  return (
    <Card isPopup={isPopup}>
      <p className={LABEL}>Share to library</p>
      <h1 className={TITLE}>No link found</h1>
      {hasText ? (
        <>
          <p className={BODY}>
            We got shared text but couldn&rsquo;t find a URL in it.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-md border border-bone-800 bg-bone-950 p-3 text-xs text-bone-300">
            {sharedText}
          </pre>
        </>
      ) : (
        <p className={BODY}>
          Open the library and paste a link from there, or try sharing
          again from the original page.
        </p>
      )}
      <Actions>
        {isPopup ? (
          <PopupDone variant="secondary" />
        ) : (
          <>
            <Link href="/library?add=1" className={BTN_PRIMARY}>
              Paste a link
            </Link>
            <Link href="/library" className={BTN_SECONDARY}>
              Go to library
            </Link>
          </>
        )}
      </Actions>
    </Card>
  );
}

function ErrorState({
  error,
  url,
  isPopup,
}: {
  error: string;
  url: string;
  isPopup: boolean;
}) {
  return (
    <Card isPopup={isPopup}>
      <p className={LABEL}>Share to library</p>
      <h1 className={TITLE}>Couldn&rsquo;t save that link</h1>
      <p className={BODY}>{error}</p>
      <p className="mt-2 break-all text-xs text-bone-200">{url}</p>
      <Actions>
        {isPopup ? (
          <PopupError retryUrl={url} />
        ) : (
          <>
            <Link
              href={`/library/share?url=${encodeURIComponent(url)}`}
              className={BTN_PRIMARY}
            >
              Try again
            </Link>
            <Link href="/library" className={BTN_SECONDARY}>
              Go to library
            </Link>
          </>
        )}
      </Actions>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Layout

function PopupShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-6">
      <div className="w-full max-w-sm rounded-2xl border border-bone-800 bg-bone-950 p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function Card({
  children,
  isPopup,
}: {
  children: React.ReactNode;
  isPopup: boolean;
}) {
  if (isPopup) return <PopupShell>{children}</PopupShell>;
  return (
    <div className="mx-auto mt-16 w-full max-w-md px-4">
      <div className="rounded-2xl border border-bone-800 bg-bone-950 p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap gap-2">{children}</div>;
}

const LABEL =
  "text-xs font-semibold uppercase tracking-[0.2em] text-claude-300";
const TITLE =
  "mt-1 text-balance font-display text-xl font-semibold tracking-tight text-bone-50";
const BODY = "mt-3 text-pretty text-sm text-bone-200";
const BTN_PRIMARY =
  "inline-flex min-h-[44px] items-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const BTN_SECONDARY =
  "inline-flex min-h-[44px] items-center rounded-full border border-bone-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
