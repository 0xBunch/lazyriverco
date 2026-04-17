"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { $Enums } from "@prisma/client";
import { cn } from "@/lib/utils";
import { FocusTrap } from "@/components/FocusTrap";
import { originLabel } from "@/lib/gallery-origin";
import { buildGalleryHref } from "@/lib/gallery-url";

// Gallery filter sheet. Opens via URL param ?filter=1 (server parses,
// client renders). Same open/close discipline as GalleryAddModal: the
// URL owns the state so back-button closes cleanly and deep-links work.
//
// Filter VALUES live in the other URL params (q / tag / by / origin).
// The sheet is just the UI for picking them. "Apply" navigates to the
// filtered URL (stripping ?filter=1) which closes the sheet AND applies.
// "Clear all" navigates to /gallery.

type OriginKey = $Enums.MediaOrigin;

export type GalleryMember = {
  id: string;
  displayName: string;
};

type Props = {
  open: boolean;
  /** All distinct tags currently in use across READY media, sorted alpha. */
  allTags: string[];
  /** All members — for the uploader filter (v1 only allows self-filter,
   *  but surfacing every member's name sets us up for v2 picker). */
  allMembers: GalleryMember[];
  viewerId: string;
  /** Current URL state — so we can seed the sheet with what's already active. */
  current: {
    q: string | null;
    tag: string | null;
    origin: OriginKey | null;
    byUserId: string | null;
  };
};

export function GalleryFilterSheet({
  open,
  allTags,
  allMembers,
  viewerId,
  current,
}: Props) {
  const router = useRouter();
  const titleId = useId();

  // Local draft state seeded from current URL. Apply commits; Cancel
  // or backdrop-click discards.
  const [draft, setDraft] = useState<{
    tag: string | null;
    origin: OriginKey | null;
    byUserId: string | null;
  }>({
    tag: current.tag,
    origin: current.origin,
    byUserId: current.byUserId,
  });

  const close = useCallback(() => {
    router.push(buildGalleryHref(current));
  }, [router, current]);

  // Reset draft when reopening so stale local edits don't persist.
  useEffect(() => {
    if (open) {
      setDraft({
        tag: current.tag,
        origin: current.origin,
        byUserId: current.byUserId,
      });
    }
  }, [open, current.tag, current.origin, current.byUserId]);

  if (!open) return null;

  const apply = () => {
    router.push(
      buildGalleryHref({
        q: current.q,
        tag: draft.tag,
        origin: draft.origin,
        byUserId: draft.byUserId,
      }),
    );
  };

  const clearAll = () => {
    router.push("/gallery");
  };

  const hasDraft = Boolean(draft.tag || draft.origin || draft.byUserId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bone-950/80 px-4 py-10 backdrop-blur-sm"
      onClick={(e) => {
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
              Filter the wall
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-m-2 flex h-11 w-11 items-center justify-center rounded-md text-bone-400 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="space-y-6">
          <section>
            <SectionLabel>Source</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                label="All"
                active={draft.origin === null}
                onClick={() => setDraft((d) => ({ ...d, origin: null }))}
              />
              {(["UPLOAD", "YOUTUBE", "INSTAGRAM", "X", "WEB"] as const).map(
                (o) => (
                  <FilterChip
                    key={o}
                    label={originLabel(o)}
                    active={draft.origin === o}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        origin: d.origin === o ? null : o,
                      }))
                    }
                  />
                ),
              )}
            </div>
          </section>

          <section>
            <SectionLabel>Uploader</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                label="Everyone"
                active={draft.byUserId === null}
                onClick={() => setDraft((d) => ({ ...d, byUserId: null }))}
              />
              <FilterChip
                label="My uploads"
                active={draft.byUserId === viewerId}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    byUserId: d.byUserId === viewerId ? null : viewerId,
                  }))
                }
              />
              {/* Keep the member list visible but not yet interactive —
                  v2 adds per-member filtering; for now show it so the
                  picker shape is familiar when we enable it. */}
              {allMembers.length > 0 ? (
                <div className="mt-1 w-full text-[11px] text-bone-300">
                  Per-member picker coming in v2
                </div>
              ) : null}
            </div>
          </section>

          {allTags.length > 0 ? (
            <section>
              <SectionLabel>Tags</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="Any"
                  active={draft.tag === null}
                  onClick={() => setDraft((d) => ({ ...d, tag: null }))}
                />
                {allTags.map((t) => (
                  <FilterChip
                    key={t}
                    label={`#${t}`}
                    active={draft.tag === t}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        tag: d.tag === t ? null : t,
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          ) : (
            <section>
              <SectionLabel>Tags</SectionLabel>
              <p className="text-xs italic text-bone-300">
                Nothing tagged yet.
              </p>
            </section>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-bone-300 underline decoration-claude-500/40 underline-offset-2 hover:text-bone-50"
          >
            Clear all
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-full border border-bone-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
            >
              {hasDraft ? "Apply filters" : "Done"}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bits

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-claude-300">
      {children}
    </h3>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400",
        active
          ? "border border-claude-500/50 bg-claude-500/15 text-claude-100"
          : "border border-bone-800 bg-bone-900/40 text-bone-300 hover:bg-bone-900 hover:text-bone-100",
      )}
    >
      {label}
    </button>
  );
}

