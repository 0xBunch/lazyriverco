import Link from "next/link";
import { redirect } from "next/navigation";
import { ingestAndSaveUrlAction } from "@/app/(portal)/library/actions";

// /library/share — minimum-click ingest handler. Entry point for:
//   - PWA share_target (iOS/Android share sheet "Lazy River")
//   - Desktop bookmarklet (window.open to this URL with ?url=...)
//
// Contract: takes `url` (or `text` containing a URL, per iOS's habit of
// smushing a shared URL into free text), calls the existing library
// ingest pipeline, and redirects to the new item. Zero clicks between
// share and saved.
//
// Auth: lives inside (portal)/ so middleware.ts enforces the session
// cookie presence check. Crypto verification happens inside
// ingestAndSaveUrlAction -> requireUser(). An unauthed visitor gets
// redirected to /start per the standard middleware behavior.

type ShareSearchParams = {
  url?: string | string[];
  title?: string | string[];
  text?: string | string[];
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

  // Resolve the target URL. Priority:
  //   1. `url` param (what Android + well-behaved iOS share provides)
  //   2. First URL-looking substring of `text` (what iOS Safari often
  //      does — shoves the URL into the `text` field inside prose)
  const resolvedUrl = rawUrl?.trim() || extractUrl(rawText);

  if (!resolvedUrl) {
    return (
      <EmptyState hasText={Boolean(rawText?.trim())} sharedText={rawText} />
    );
  }

  const caption = (rawTitle ?? "").trim();
  const result = await ingestAndSaveUrlAction({
    url: resolvedUrl,
    caption,
    tags: "",
  });

  if (result.ok) {
    // Next's redirect() throws NEXT_REDIRECT; the framework intercepts
    // and returns a 302 to the item detail page. Rendering never
    // completes past this line.
    redirect(`/library/${result.mediaId}`);
  }

  return <ErrorState error={result.error} url={resolvedUrl} />;
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

function EmptyState({
  hasText,
  sharedText,
}: {
  hasText: boolean;
  sharedText: string | undefined;
}) {
  return (
    <Card>
      <p className={LABEL}>Share to library</p>
      <h1 className={TITLE}>No link found</h1>
      {hasText ? (
        <>
          <p className={BODY}>
            We got shared text but couldn&rsquo;t find a URL in it.
          </p>
          <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-bone-800 bg-bone-950 p-3 text-xs text-bone-300">
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
        <Link href="/library?add=1" className={BTN_PRIMARY}>
          Paste a link
        </Link>
        <Link href="/library" className={BTN_SECONDARY}>
          Go to library
        </Link>
      </Actions>
    </Card>
  );
}

function ErrorState({ error, url }: { error: string; url: string }) {
  const retryHref = `/library/share?url=${encodeURIComponent(url)}`;
  return (
    <Card>
      <p className={LABEL}>Share to library</p>
      <h1 className={TITLE}>Couldn&rsquo;t save that link</h1>
      <p className={BODY}>{error}</p>
      <p className="mt-2 break-all text-xs text-bone-400">{url}</p>
      <Actions>
        <Link href={retryHref} className={BTN_PRIMARY}>
          Try again
        </Link>
        <Link href="/library" className={BTN_SECONDARY}>
          Go to library
        </Link>
      </Actions>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
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
  "inline-flex items-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const BTN_SECONDARY =
  "inline-flex items-center rounded-full border border-bone-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
