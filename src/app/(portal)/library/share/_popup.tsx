"use client";

// Client-side affordances for the popup success/error cards.
// - PopupDone: primary "Done" button → window.close()
// - PopupViewInOpener: secondary link that navigates the main browser
//   tab (window.opener) to /library/<id>, then closes the popup. Falls
//   back to navigating the popup itself if the opener was closed.
// - PopupError: "Try again" → reload with the same URL; "Close" →
//   window.close()
//
// window.close() only works on windows opened by script (which our
// popup is, via window.open from the bookmarklet). The fallback
// branches exist for the edge case where the user manually pasted the
// /library/share URL into a tab — in which case there's no opener and
// close() is a no-op, so we navigate the tab instead.

export function PopupDone({
  variant = "primary",
}: {
  variant?: "primary" | "secondary";
}) {
  const close = () => {
    // window.close() is silently ignored in tabs that weren't opened
    // by script. Provide a sensible fallback so the button is never a
    // dead click.
    window.close();
    // If we're still here after close(), it was blocked. Navigate
    // somewhere useful instead of leaving the user staring at a stale
    // success card. A short delay gives legitimate closes time to
    // actually fire.
    window.setTimeout(() => {
      if (!window.closed) window.location.href = "/library";
    }, 60);
  };
  return (
    <button
      type="button"
      onClick={close}
      className={variant === "primary" ? BTN_PRIMARY : BTN_SECONDARY}
    >
      Done
    </button>
  );
}

export function PopupViewInOpener({ mediaId }: { mediaId: string }) {
  const openInParent = () => {
    const href = `/library/${mediaId}`;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.location.href = href;
        window.opener.focus();
        window.close();
        return;
      }
    } catch {
      // Cross-origin lock or other — fall through to same-window nav.
    }
    window.location.href = href;
  };
  return (
    <button
      type="button"
      onClick={openInParent}
      className="inline-flex min-h-[44px] items-center text-xs font-semibold uppercase tracking-[0.2em] text-claude-200 underline-offset-4 transition-colors hover:text-claude-100 hover:underline focus:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-claude-400"
    >
      View item →
    </button>
  );
}

export function PopupError({ retryUrl }: { retryUrl: string }) {
  const retry = () => {
    window.location.href = `/library/share?popup=1&url=${encodeURIComponent(retryUrl)}`;
  };
  return (
    <>
      <button type="button" onClick={retry} className={BTN_PRIMARY}>
        Try again
      </button>
      <PopupDone variant="secondary" />
    </>
  );
}

const BTN_PRIMARY =
  "inline-flex min-h-[44px] items-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const BTN_SECONDARY =
  "inline-flex min-h-[44px] items-center rounded-full border border-bone-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
