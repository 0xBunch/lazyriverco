"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  attachMediaToCalendarEntry,
  reorderCalendarEntryMedia,
} from "@/app/(portal)/admin/calendar/actions";
import { MediaUploader, type UploadedMedia } from "@/components/MediaUploader";
import { cn } from "@/lib/utils";

// Client wrapper that sits on the admin detail page. Owns:
//   - Invoking the server action when the MediaUploader emits a completed
//     upload (this is how a bare mediaId becomes "attached to THIS entry").
//   - The up/down reorder UI (plain buttons, not drag-and-drop — keyboard-
//     first and no extra deps). Drag-and-drop can be layered on later if
//     the admin asks for it.
//   - Triggering router.refresh() after mutations so the server component
//     (which owns the initial attachments list) re-fetches without a full
//     page reload.
//
// Detach + "set cover" are rendered as inline <form action={serverAction}>
// submissions directly inside this component — those don't need client
// transition handling because they navigate through the standard server
// action flow.

type Attachment = {
  id: string;
  position: number;
  isCover: boolean;
  caption: string | null;
  media: {
    id: string;
    url: string;
    mimeType: string | null;
    caption: string | null;
  };
};

type Props = {
  calendarEntryId: string;
  attachments: Attachment[];
  /** Both forms live in this subtree — pass the server actions so the
   *  tree can remain uncoupled to the actions' import path. */
  detachAction: (formData: FormData) => void | Promise<void>;
  setCoverAction: (formData: FormData) => void | Promise<void>;
};

export function CalendarEntryMediaSection({
  calendarEntryId,
  attachments,
  detachAction,
  setCoverAction,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [attachError, setAttachError] = useState<string | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  const handleUploaded = useCallback(
    (media: UploadedMedia) => {
      setAttachError(null);
      startTransition(async () => {
        try {
          await attachMediaToCalendarEntry({
            calendarEntryId,
            mediaId: media.mediaId,
          });
          setStatusAnnouncement("Photo attached.");
          router.refresh();
        } catch (err) {
          setAttachError(
            err instanceof Error ? err.message : "Failed to attach photo",
          );
        }
      });
    },
    [calendarEntryId, router],
  );

  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= attachments.length) return;
      const next = [...attachments];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      const orderedAttachIds = next.map((a) => a.id);

      startTransition(async () => {
        try {
          await reorderCalendarEntryMedia({ calendarEntryId, orderedAttachIds });
          setStatusAnnouncement(
            `Photo moved to position ${toIndex + 1} of ${attachments.length}.`,
          );
          router.refresh();
        } catch (err) {
          setAttachError(
            err instanceof Error ? err.message : "Failed to reorder",
          );
        }
      });
    },
    [attachments, calendarEntryId, router],
  );

  return (
    <div className="space-y-4">
      <MediaUploader onUploaded={handleUploaded} />

      {attachError ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {attachError}
        </p>
      ) : null}

      {/* Live region for reorder/attach status. Announces "Photo 2 moved
          up" style updates to screen reader users so the outcome of
          icon-only controls isn't invisible. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {statusAnnouncement}
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs italic text-bone-300">
          No photos attached yet. Drop some above.
        </p>
      ) : (
        <ul
          className={cn(
            "grid grid-cols-2 gap-3 sm:grid-cols-3",
            isPending && "opacity-70",
          )}
        >
          {attachments.map((a, i) => {
            // Photo N of M for positional context in aria-labels. Without
            // this, a screen reader user hears "Move up" with no referent
            // — review flagged this as compounding into an unusable UI.
            const photoLabel =
              a.caption ??
              a.media.caption ??
              `Photo ${i + 1} of ${attachments.length}`;
            return (
              <li
                key={a.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-bone-900",
                  a.isCover ? "border-claude-500" : "border-bone-700",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.media.url}
                  alt={photoLabel}
                  className="aspect-square w-full object-cover"
                />
                <div className="space-y-2 p-2">
                  {a.isCover ? (
                    <span className="inline-block rounded-full bg-claude-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-claude-200">
                      Cover
                    </span>
                  ) : (
                    <form action={setCoverAction}>
                      <input type="hidden" name="attachId" value={a.id} />
                      <input
                        type="hidden"
                        name="calendarEntryId"
                        value={calendarEntryId}
                      />
                      <button
                        type="submit"
                        aria-label={`Make ${photoLabel} the cover`}
                        className="rounded text-[0.65rem] font-semibold uppercase tracking-wide text-bone-200 transition-colors hover:text-claude-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-900"
                      >
                        Make cover
                      </button>
                    </form>
                  )}

                  <div className="flex items-center justify-between gap-1">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleMove(i, i - 1)}
                        disabled={i === 0 || isPending}
                        aria-label={`Move ${photoLabel} up`}
                        className="rounded-md px-1.5 py-0.5 text-xs text-bone-300 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-900 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(i, i + 1)}
                        disabled={i === attachments.length - 1 || isPending}
                        aria-label={`Move ${photoLabel} down`}
                        className="rounded-md px-1.5 py-0.5 text-xs text-bone-300 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-900 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                    <form action={detachAction}>
                      <input type="hidden" name="attachId" value={a.id} />
                      <input
                        type="hidden"
                        name="calendarEntryId"
                        value={calendarEntryId}
                      />
                      {/* Disabled during pending reorder to avoid the
                          "remove a row mid-reorder" interleave the review
                          called out. Standard form submissions bypass
                          useTransition, so this is the only gate. */}
                      <button
                        type="submit"
                        disabled={isPending}
                        aria-label={`Remove ${photoLabel} from entry`}
                        className="rounded-md px-1.5 py-0.5 text-xs text-bone-300 transition-colors hover:bg-bone-800 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-900 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
