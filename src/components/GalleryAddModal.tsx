"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FocusTrap } from "@/components/FocusTrap";
import { MediaUploader, type UploadedMedia } from "@/components/MediaUploader";
import {
  ingestAndSaveUrlAction,
  updateMediaMetaAction,
} from "@/app/(portal)/gallery/actions";

// Gallery add modal. Opened via the URL param ?add=1 (server parses,
// client renders). Two tabs:
//   - Paste link  → ingestAndSaveUrlAction → redirect to new item
//   - Upload file → MediaUploader + updateMediaMetaAction → redirect
//
// The caption + tags inputs are shared across tabs so switching between
// them preserves what the user has typed. Closing the modal (backdrop
// click, Escape, or × button) navigates back to /gallery without the
// add param — that's the "state lives in the URL" discipline the grid
// page already uses.
//
// Accessibility: FocusTrap component (src/components/FocusTrap.tsx) owns
// the keyboard containment + initial focus + restore-on-close. The
// dialog container IS the FocusTrap so aria-labelledby wires to the
// element that receives focus. Escape close is belt-and-suspendered via
// both the modal's own useEffect and FocusTrap's onEscape prop.

type Tab = "paste" | "upload";

type Props = {
  /** True when the parent server component has determined ?add=1 is in the URL. */
  open: boolean;
};

export function GalleryAddModal({ open }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedMedia | null>(null);
  const [isPending, startTransition] = useTransition();

  const titleId = useId();

  const close = useCallback(() => {
    router.push("/gallery");
  }, [router]);

  // onUploaded needs to live ABOVE the `if (!open) return null` early
  // return below — otherwise rules-of-hooks fires because this hook
  // only runs when open=true, changing the hook order between renders.
  const onUploaded = useCallback((media: UploadedMedia) => {
    setUploaded(media);
  }, []);

  // FocusTrap handles initial focus (container itself), keyboard containment,
  // and restore-on-close. We keep a redundant Escape-close useEffect below
  // so the modal closes even if FocusTrap is ever ripped out.

  // Close on Escape. Register/unregister based on `open` so we don't
  // eat Escape when the modal isn't mounted.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Reset per-open state when the modal closes so a reopen starts clean.
  useEffect(() => {
    if (!open) {
      setTab("paste");
      setUrl("");
      setCaption("");
      setTags("");
      setError(null);
      setUploaded(null);
    }
  }, [open]);

  if (!open) return null;

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await ingestAndSaveUrlAction({ url, caption, tags });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/gallery/${res.mediaId}`);
    });
  };

  const handleUploadSave = () => {
    if (!uploaded) {
      setError("Upload a file first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateMediaMetaAction({
        mediaId: uploaded.mediaId,
        caption,
        tags,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/gallery/${uploaded.mediaId}`);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bone-950/80 px-4 py-10 backdrop-blur-sm"
      onClick={(e) => {
        // Close on backdrop click only. The modal body stops propagation.
        if (e.target === e.currentTarget) close();
      }}
    >
      <FocusTrap
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-bone-800 bg-bone-950 p-6 shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        onEscape={close}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
              Gallery
            </p>
            <h2
              id={titleId}
              className="mt-1 font-display text-xl font-semibold tracking-tight text-bone-50"
            >
              Drop something on the wall
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-md p-1 text-bone-400 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Add method"
          className="mb-4 flex gap-1 rounded-full bg-bone-900 p-1 text-xs font-semibold uppercase tracking-[0.15em]"
        >
          <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
            Paste link
          </TabButton>
          <TabButton active={tab === "upload"} onClick={() => setTab("upload")}>
            Upload
          </TabButton>
        </div>

        {tab === "paste" ? (
          <form onSubmit={handlePasteSubmit} className="space-y-4">
            <FieldLabel htmlFor="add-url">
              YouTube, X, Instagram, or any link
            </FieldLabel>
            <input
              id="add-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className={INPUT}
              disabled={isPending}
            />

            <CaptionAndTags
              caption={caption}
              onCaption={setCaption}
              tags={tags}
              onTags={setTags}
              disabled={isPending}
            />

            {error ? <ErrorLine>{error}</ErrorLine> : null}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={close} className={BTN_SECONDARY}>
                Cancel
              </button>
              <button type="submit" disabled={isPending} className={BTN_PRIMARY}>
                {isPending ? "Fetching…" : "Add to gallery"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <MediaUploader onUploaded={onUploaded} maxFiles={1} />

            <CaptionAndTags
              caption={caption}
              onCaption={setCaption}
              tags={tags}
              onTags={setTags}
              disabled={isPending}
            />

            {error ? <ErrorLine>{error}</ErrorLine> : null}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={close} className={BTN_SECONDARY}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadSave}
                disabled={!uploaded || isPending}
                className={BTN_PRIMARY}
              >
                {isPending ? "Saving…" : uploaded ? "Save to gallery" : "Upload a photo first"}
              </button>
            </div>
          </div>
        )}
      </FocusTrap>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bits

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-4 py-2 transition-colors",
        active
          ? "bg-claude-500/20 text-claude-100"
          : "text-bone-400 hover:text-bone-100",
      )}
    >
      {children}
    </button>
  );
}

function CaptionAndTags({
  caption,
  onCaption,
  tags,
  onTags,
  disabled,
}: {
  caption: string;
  onCaption: (v: string) => void;
  tags: string;
  onTags: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div>
        <FieldLabel htmlFor="add-caption">Caption (optional)</FieldLabel>
        <textarea
          id="add-caption"
          value={caption}
          onChange={(e) => onCaption(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="What's the story?"
          className={cn(INPUT, "resize-none")}
          disabled={disabled}
        />
      </div>
      <div>
        <FieldLabel htmlFor="add-tags">Tags</FieldLabel>
        <input
          id="add-tags"
          type="text"
          value={tags}
          onChange={(e) => onTags(e.target.value)}
          placeholder="comma, separated, like-this"
          className={INPUT}
          disabled={disabled}
        />
        <p className="mt-1 text-[11px] text-bone-500">
          a–z, 0–9, dash or underscore. Up to 8.
        </p>
      </div>
    </>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-bone-300"
    >
      {children}
    </label>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-300">
      {children}
    </p>
  );
}

const INPUT =
  "w-full rounded-md border border-bone-800 bg-bone-900/60 px-3 py-2 text-sm text-bone-100 placeholder:text-bone-500 focus:border-claude-500/60 focus:outline-none disabled:opacity-60";
const BTN_PRIMARY =
  "rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:opacity-50 disabled:hover:bg-claude-500/10";
const BTN_SECONDARY =
  "rounded-full border border-bone-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
