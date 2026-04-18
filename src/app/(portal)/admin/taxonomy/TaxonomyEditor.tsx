"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BANNED_LABEL } from "@/lib/taxonomy-constants";
import {
  addSlugAction,
  removeSlugAction,
  type AdminTaxonomyState,
} from "./actions";

export type BucketView = {
  id: string;
  label: string;
  slugs: string[];
  sortOrder: number;
};

// One editor per bucket (people / places / topics / vibes). Each bucket
// is a self-contained form: add-input on the right, chip list on the
// left, status line at the bottom. We intentionally do NOT share state
// across buckets — each bucket's form has its own add + remove action,
// so pending/error messages stay local to the bucket the admin just
// touched. Reduces "which bucket did that message belong to?" confusion.

export function TaxonomyEditor({ buckets }: { buckets: BucketView[] }) {
  return (
    <div className="space-y-6">
      {buckets.map((b) => (
        <BucketCard key={b.id} bucket={b} />
      ))}
    </div>
  );
}

function BucketCard({ bucket }: { bucket: BucketView }) {
  const [addState, addAction] = useFormState(addSlugAction, null);
  const [removeState, removeAction] = useFormState(removeSlugAction, null);
  const latest: AdminTaxonomyState = removeState ?? addState ?? null;

  const descriptor = BUCKET_DESCRIPTORS[bucket.label] ?? null;
  const isBanned = bucket.label === BANNED_LABEL;

  return (
    <section
      className={cn(
        "rounded-2xl border p-5",
        isBanned
          ? "border-red-900/60 bg-red-950/20"
          : "border-bone-800 bg-bone-900/40",
      )}
    >
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          className={cn(
            "font-display text-lg font-semibold uppercase tracking-[0.18em]",
            isBanned ? "text-red-300" : "text-claude-300",
          )}
        >
          {isBanned ? "banned" : bucket.label}
        </h2>
        <span className="text-xs text-bone-400">
          {bucket.slugs.length} slug{bucket.slugs.length === 1 ? "" : "s"}
        </span>
        {descriptor ? (
          <p className="basis-full text-xs italic text-bone-400 text-pretty">
            {descriptor}
          </p>
        ) : null}
      </header>

      {bucket.slugs.length === 0 ? (
        <p className="mb-4 text-sm italic text-bone-400">
          {isBanned
            ? "No banned tags. Add a slug here and it'll be stripped from the whole gallery + blocked from future AI runs."
            : "No slugs yet — Gemini will produce open vocabulary here."}
        </p>
      ) : (
        <ul className="mb-4 flex flex-wrap gap-1.5">
          {bucket.slugs.map((slug) => (
            <li key={slug}>
              <form action={removeAction} className="contents">
                <input type="hidden" name="bucketId" value={bucket.id} />
                <input type="hidden" name="slug" value={slug} />
                <RemoveChip slug={slug} banned={isBanned} />
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={addAction}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="bucketId" value={bucket.id} />
        <label htmlFor={`add-slug-${bucket.id}`} className="sr-only">
          {isBanned ? "Ban a slug" : `Add a slug to ${bucket.label}`}
        </label>
        <input
          id={`add-slug-${bucket.id}`}
          name="slug"
          type="text"
          placeholder={EXAMPLE_SLUG[bucket.label] ?? "new-slug"}
          maxLength={40}
          autoComplete="off"
          className={cn(
            "min-w-[220px] flex-1 rounded-md border px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-400 focus:outline-none focus-visible:ring-2",
            isBanned
              ? "border-red-900/60 bg-red-950/30 focus:border-red-500/60 focus-visible:ring-red-400"
              : "border-bone-800 bg-bone-900/60 focus:border-claude-500/60 focus-visible:ring-claude-400",
          )}
        />
        <AddButton banned={isBanned} />
      </form>

      {latest ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "mt-3 text-xs",
            latest.ok ? "text-emerald-300" : "text-red-300",
          )}
        >
          {latest.ok ? latest.message : latest.error}
        </p>
      ) : null}
    </section>
  );
}

function AddButton({ banned }: { banned: boolean }) {
  const { pending } = useFormStatus();
  return (
    <SubmitBtn pending={pending} kind={banned ? "danger" : "secondary"}>
      {pending
        ? banned
          ? "Banning…"
          : "Adding…"
        : banned
          ? "🚫 Ban tag"
          : "+ Add slug"}
    </SubmitBtn>
  );
}

function RemoveChip({ slug, banned }: { slug: string; banned: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        banned
          ? "border-red-900/60 bg-red-950/40 text-red-100 hover:border-emerald-600/50 hover:bg-emerald-900/20 hover:text-emerald-100"
          : "border-bone-800 bg-bone-900 text-bone-100 hover:border-red-500/40 hover:bg-red-900/20 hover:text-red-100",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-50",
      )}
      aria-label={banned ? `Unban ${slug}` : `Remove ${slug}`}
    >
      <span className="font-mono">{slug}</span>
      <span
        aria-hidden
        className={cn(
          "transition-colors",
          banned
            ? "text-red-400 group-hover:text-emerald-300"
            : "text-bone-400 group-hover:text-red-300",
        )}
      >
        ×
      </span>
    </button>
  );
}

function SubmitBtn({
  pending,
  kind,
  children,
}: {
  pending: boolean;
  kind: "secondary" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40",
        kind === "secondary" &&
          "border-bone-800 bg-bone-900/60 text-bone-200 hover:text-bone-50 focus-visible:ring-claude-400",
        kind === "danger" &&
          "border-red-900/60 bg-red-950/50 text-red-100 hover:border-red-700 hover:bg-red-900/40 focus-visible:ring-red-400",
      )}
    >
      {children}
    </button>
  );
}

// Per-bucket helper text + placeholder so the admin knows what kind of
// slugs go where without needing docs open. Label-keyed so adding a new
// bucket in the migration just needs an entry here (or falls through to
// the generic default).

const BUCKET_DESCRIPTORS: Record<string, string> = {
  people:
    "Full-name slugs the model should use verbatim for the crew + recurring figures. Dash-separated first-last (e.g. sidney-sweeney).",
  places:
    "Canonical venue / city / spot names so different angles of the same place converge on one slug.",
  topics:
    "Teams, franchises, brands, recurring subjects — the catch-all bucket. Prefer specific over generic (chicago-bears, not bears).",
  vibes:
    "Activities + moods + recurring themes. Concrete over abstract — pool-day, not vacation; red-carpet, not fashion.",
  banned:
    "Tags that should never exist on a gallery item. Adding here runs a full sweep: strips from every Media row and blocks the AI from emitting it going forward. Click a chip to unban (future runs only — already-stripped rows don't come back).",
};

const EXAMPLE_SLUG: Record<string, string> = {
  people: "sidney-sweeney",
  places: "wrigley-field",
  topics: "chicago-bears",
  vibes: "pool-day",
  banned: "a-tag-you-never-want",
};
