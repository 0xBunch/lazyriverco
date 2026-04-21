"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy, IconPhoto, IconShare3 } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO } from "@/lib/chat";
import {
  extensionForImageMime,
  extractSafeMediaUrls,
  isImageOnlyMessage,
  normalizeImageContentType,
} from "@/lib/safe-media";

type MessageActionsProps = {
  message: ChatMessageDTO;
  conversationId: string;
};

// Confirm-state duration; long enough to read, short enough to not nag.
const CONFIRM_MS = 1500;

// Module-level singleton — only ONE share request can be in flight at a
// time across all MessageActions instances. Clicking "Share image" on a
// second message while the first is mid-render aborts the first. Without
// this, two PNGs race to resolve and two share sheets fight on mobile.
let currentShareAbort: AbortController | null = null;

// Share errors from `navigator.share` that mean "user dismissed / the
// browser revoked the gesture" — we must NOT fall through to download in
// these cases, the member either cancelled or hit a transient-activation
// expiry on iOS Safari and thinks they cancelled.
const SHARE_BAIL_NAMES = new Set(["AbortError", "NotAllowedError"]);

// Slug-sanitize the character name for the download filename. The field
// is admin-curated today but passing unsanitized strings into File names
// / Content-Disposition on Android can produce garbled downloads. Cheap
// to harden now.
function safeNameSlug(raw: string): string {
  const cleaned = raw.replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  return cleaned.length > 0 ? cleaned.toLowerCase() : "message";
}

function buildCopyText(message: ChatMessageDTO): string {
  const name = message.author.displayName;
  return `${message.content}\n\n— ${name} via lazyriver.co`;
}

// Variant used as the `text` param on `navigator.share({ text })` when
// the OG card is the share payload. Strips any inline safe-media URLs
// so mixed text+image messages (rare today, possible once agent tool
// calls start embedding images inline) don't dump the raw R2 URL into
// the iMessage / Slack compose box alongside the rendered card.
function buildShareText(message: ChatMessageDTO): string {
  const attribution = `— ${message.author.displayName} via lazyriver.co`;
  const urls = extractSafeMediaUrls(message.content);
  let cleaned = message.content;
  for (const u of urls) cleaned = cleaned.split(u).join("");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned ? `${cleaned}\n\n${attribution}` : attribution;
}

/**
 * Action row for a character message: Copy (markdown) + Share image.
 *
 * Copy writes the message body + a short attribution footer to the
 * clipboard. Share image fetches a server-rendered PNG from the
 * share-image route and either opens the native share sheet (mobile)
 * or downloads the file (desktop) — same bytes either way so members
 * can paste into iMessage / Slack / Notes without a round trip.
 *
 * Concurrency model:
 *   - Same-message double-click: `copyBusyRef` / `shareBusyRef` block
 *     a second invocation until the first resolves.
 *   - Cross-message rapid click: module-level `currentShareAbort`
 *     cancels a prior in-flight share so only the most recent click
 *     wins.
 *   - Unmount during share: instance-level `abortRef` fires an abort
 *     on cleanup so the fetch doesn't race against an unmounted tree.
 */
export function MessageActions({ message, conversationId }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyBusyRef = useRef(false);
  const shareBusyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset confirmation state + cancel any pending flash timer when the
  // message identity changes (polling can swap DTOs in place). Without
  // this, a "Copied" checkmark from message A can vanish mid-read once
  // the list re-renders.
  useEffect(() => {
    if (copyResetRef.current) {
      clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }
    setCopied(false);
    setError(null);
  }, [message.id]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (copyBusyRef.current) return;
    copyBusyRef.current = true;
    setError(null);
    try {
      await navigator.clipboard.writeText(buildCopyText(message));
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), CONFIRM_MS);
    } catch (err) {
      console.error("[MessageActions] copy failed", err);
      setError("Copy failed");
    } finally {
      copyBusyRef.current = false;
    }
  }, [message]);

  const handleShareImage = useCallback(async () => {
    if (shareBusyRef.current) return;
    shareBusyRef.current = true;
    setError(null);
    setSharing(true);

    // Cross-instance: abort whatever share was last in flight anywhere
    // on the page, then register this one as the active share.
    currentShareAbort?.abort();
    const abort = new AbortController();
    currentShareAbort = abort;
    abortRef.current = abort;

    // Two share paths:
    //   1. Message content IS a generated/media image URL → fetch the
    //      raw bytes from R2 and share the actual image. What the user
    //      wants when tapping Share on a generated-image bubble.
    //   2. Anything else → fetch the server-rendered OG quote card PNG.
    //      What the user wants for text agent replies.
    // Direct-path errors (R2 CORS regression, network flap) fall back
    // to the OG route rather than surfacing "Share failed" — the worst
    // case is a quote card showing the URL, which is still useful.
    const directImageUrl = isImageOnlyMessage(message.content);
    const ogRouteUrl = `/api/conversations/${conversationId}/messages/${message.id}/share-image`;

    try {
      let blob: Blob | null = null;
      let usedDirectPath = false;

      if (directImageUrl) {
        try {
          const res = await fetch(directImageUrl, {
            mode: "cors",
            signal: abort.signal,
          });
          if (res.ok) {
            blob = await res.blob();
            usedDirectPath = true;
          } else {
            console.warn(
              "[MessageActions] direct-image fetch non-OK, falling back to OG",
              res.status,
            );
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          // Network / CORS / TypeError — keep `blob` null so we fall
          // through to the OG route below.
          console.warn(
            "[MessageActions] direct-image fetch failed, falling back to OG",
            err,
          );
        }
      }

      if (!blob) {
        const res = await fetch(ogRouteUrl, { signal: abort.signal });
        if (!res.ok) {
          throw new Error(`Image request failed (${res.status})`);
        }
        blob = await res.blob();
      }

      // MIME + extension only differ when the direct path succeeded.
      // Fallback OG route always returns PNG.
      const mime = usedDirectPath
        ? normalizeImageContentType(blob.type)
        : "image/png";
      const ext = usedDirectPath ? extensionForImageMime(mime) : "png";
      const filename = `lazyriver-${safeNameSlug(message.author.name)}-${message.id.slice(0, 8)}.${ext}`;
      const file = new File([blob], filename, { type: mime });

      // Prefer the native share sheet with a real file attachment. Only
      // offer it when the UA actually supports file-sharing (iOS Safari,
      // Android Chrome). Desktop Safari's `navigator.share` exists but
      // doesn't accept files — gate on `canShare({ files })`.
      const canShareFile =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: `${message.author.displayName} on lazyriver.co`,
            // Image-only direct path: no caption (nothing to attribute).
            // OG-card path: strip inline media URLs from the attribution
            // so a future mixed-content message doesn't leak URLs.
            text: usedDirectPath ? undefined : buildShareText(message),
          });
          return;
        } catch (err) {
          // AbortError = user cancelled. NotAllowedError = iOS revoked
          // the gesture (e.g. the fetch took > 5s and transient
          // activation expired — the sheet briefly showed then dismissed).
          // In both cases, do NOT fall through to a surprise download.
          if (err instanceof DOMException && SHARE_BAIL_NAMES.has(err.name)) {
            return;
          }
          // Anything else — TypeError, DataError — is a programmatic
          // failure. Fall through to the download fallback.
          console.warn("[MessageActions] share failed, falling back", err);
        }
      }

      // Desktop (or no share API): trigger a download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick so Safari has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[MessageActions] share image failed", err);
      setError("Share failed");
    } finally {
      if (currentShareAbort === abort) {
        currentShareAbort = null;
      }
      if (abortRef.current === abort) {
        abortRef.current = null;
      }
      shareBusyRef.current = false;
      setSharing(false);
    }
  }, [conversationId, message]);

  return (
    <div className="mt-1.5 flex items-center gap-1 text-xs text-bone-400">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy message as markdown"}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
          "hover:bg-bone-800/60 hover:text-bone-100",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
        )}
      >
        {copied ? (
          <>
            <IconCheck size={13} aria-hidden="true" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <IconCopy size={13} aria-hidden="true" />
            <span>Copy</span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handleShareImage}
        disabled={sharing}
        aria-label="Share as image"
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
          "hover:bg-bone-800/60 hover:text-bone-100",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {sharing ? (
          <>
            <IconPhoto size={13} aria-hidden="true" className="animate-pulse" />
            <span>Rendering…</span>
          </>
        ) : (
          <>
            <IconShare3 size={13} aria-hidden="true" />
            <span>Share image</span>
          </>
        )}
      </button>
      {error ? (
        <span className="text-claude-300" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
