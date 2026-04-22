"use client";

import { useState } from "react";

// Renders the draggable javascript: link and a copy-paste fallback.
// Lives in a client component because (1) React refuses to render
// `javascript:` hrefs without dangerouslySetInnerHTML, and (2) the
// "copy snippet" button needs the clipboard API.
//
// The rendered anchor is a real <a> element with a real href, which is
// what browsers read when the user drags from the link into the
// bookmarks bar. Clicking it in-page navigates to a javascript: URL,
// which some browsers block — that's expected and harmless; the drag
// path is the intended UX.

type Props = {
  origin: string;
};

export function BookmarkletSnippet({ origin }: Props) {
  const snippet = buildSnippet(origin);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API refused (insecure context, denied permission).
      // The <pre> below is selectable — fall back to manual copy.
    }
  };

  // The anchor is rendered via dangerouslySetInnerHTML so React emits
  // the `javascript:` href unchanged. The outer <div> wraps it so we
  // can style the drop target without mutating innerHTML. The anchor
  // is mouse-drag-only (clicks do nothing, it isn't a real link), so
  // tabindex="-1" + aria-hidden keep keyboard + screen-reader users
  // out of a dead-end affordance — they use the manual-install <pre>
  // + copy button below instead.
  const anchorHtml = `<a href="${escapeHtml(snippet)}" class="${ANCHOR_CLASS}" onclick="return false" draggable="true" tabindex="-1" aria-hidden="true">Save to Lazy River</a>`;

  return (
    <div className="w-full">
      <div
        className="flex justify-center"
        dangerouslySetInnerHTML={{ __html: anchorHtml }}
      />
      <details className="mt-4 group">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.15em] text-bone-300 transition-colors hover:text-bone-100">
          Manual install (copy snippet)
        </summary>
        <div className="mt-3">
          <pre className="max-h-40 overflow-auto rounded-md border border-bone-800 bg-bone-950 p-3 font-mono text-[11px] leading-relaxed text-bone-200">
            {snippet}
          </pre>
          <button
            type="button"
            onClick={copy}
            className="mt-2 inline-flex items-center rounded-full border border-bone-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          >
            {copied ? "Copied ✓" : "Copy snippet"}
          </button>
        </div>
      </details>
    </div>
  );
}

// Build the bookmarklet source as a single-line IIFE. Kept minimal so
// browsers don't truncate it on drag and so any future changes are
// obvious from a glance.
function buildSnippet(origin: string): string {
  const base = `${origin}/library/share`;
  return [
    "javascript:(()=>{",
    `var u='${base}?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title);`,
    "window.open(u,'lr_share','width=520,height=320,toolbar=no');",
    "})();",
  ].join("");
}

// Escape the snippet for safe embedding in the href attribute. The
// snippet contains single quotes (string literals) and forward slashes
// but no double quotes in the current build — we still escape &, <, >,
// and " defensively in case the snippet evolves.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ANCHOR_CLASS =
  "inline-flex cursor-grab select-none items-center rounded-full border border-claude-500/40 bg-claude-500/10 px-5 py-2.5 font-display text-sm font-semibold text-claude-100 shadow-sm transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 active:cursor-grabbing";
