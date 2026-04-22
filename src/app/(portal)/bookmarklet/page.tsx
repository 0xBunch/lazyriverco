import Link from "next/link";
import { headers } from "next/headers";
import { BookmarkletSnippet } from "./_snippet";

// /bookmarklet — a one-time install page for the "Save to Lazy River"
// desktop bookmarklet. KB can share this URL with members; one drag to
// the bookmarks bar and any page can be saved to the library with one
// click. The bookmarklet opens a 520x320 popup that hits /library/share,
// which ingests the URL and redirects to the new item — so the flow is
// one click, one popup, done.
//
// Why a separate page? The draggable anchor needs a javascript: href,
// which React refuses to render without dangerouslySetInnerHTML. We
// isolate that to a small client component (`BookmarkletSnippet`) so
// the rest of the page stays a regular server component.

export const dynamic = "force-dynamic";

export default async function BookmarkletPage() {
  // Compute the target origin from the incoming request so this works
  // on previews, staging, and custom domains without a hardcoded host.
  // Falls back to the canonical prod origin if headers are missing —
  // shouldn't happen in practice, but keeps the page useful from a
  // static render if someone ever SSGs it.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "lazyriver.co";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  return (
    <div className="mx-auto mt-12 w-full max-w-xl px-4 pb-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claude-300">
        Desktop shortcut
      </p>
      <h1 className="mt-1 text-balance font-display text-2xl font-semibold tracking-tight text-bone-50">
        Save to Lazy River
      </h1>
      <p className="mt-3 text-pretty text-sm text-bone-200">
        A one-click bookmarklet for your browser&rsquo;s bookmarks bar.
        Find a good photo or link anywhere on the web, click the
        bookmark, and it lands in the library. No visit required.
      </p>

      <section className="mt-8 rounded-2xl border border-bone-800 bg-bone-950 p-6">
        <h2 className="font-display text-base font-semibold text-bone-50">
          1. Drag this to your bookmarks bar
        </h2>
        <p className="mt-2 text-xs text-bone-300">
          If you don&rsquo;t see the bookmarks bar, press{" "}
          <kbd className={KBD}>⌘⇧B</kbd> (Mac) or{" "}
          <kbd className={KBD}>Ctrl+Shift+B</kbd> (Windows/Linux) to
          show it.
        </p>

        <div className="mt-4 flex justify-center">
          <BookmarkletSnippet origin={origin} />
        </div>

        <p className="mt-4 text-xs text-bone-300">
          Some browsers (Safari, Firefox in strict mode) won&rsquo;t
          accept dragged bookmarklets. In that case, copy the snippet
          below, create a new bookmark manually, and paste it into the
          URL / address field.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-bone-800 bg-bone-950 p-6">
        <h2 className="font-display text-base font-semibold text-bone-50">
          2. Use it
        </h2>
        <p className="mt-2 text-sm text-bone-200">
          Open any page you want to save, click the{" "}
          <strong className="text-bone-50">Save to Lazy River</strong>{" "}
          bookmark. A small popup confirms the save, then closes
          itself. The item is live in the library immediately.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-bone-800 bg-bone-950 p-6">
        <h2 className="font-display text-base font-semibold text-bone-50">
          On mobile?
        </h2>
        <p className="mt-2 text-sm text-bone-200">
          Install Lazy River as an app instead — then &ldquo;Lazy
          River&rdquo; will appear in your phone&rsquo;s share sheet.
          One tap from any app.
        </p>
        <Link
          href="/app"
          className="mt-4 inline-flex items-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        >
          Install on phone →
        </Link>
      </section>
    </div>
  );
}

const KBD =
  "rounded border border-bone-700 bg-bone-900 px-1.5 py-0.5 font-mono text-[10px] text-bone-100";
