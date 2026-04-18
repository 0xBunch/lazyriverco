"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
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

  return (
    <section className="rounded-2xl border border-bone-800 bg-bone-900/40 p-5">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.18em] text-claude-300">
          {bucket.label}
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
          No slugs yet — Gemini will produce open vocabulary here.
        </p>
      ) : (
        <ul className="mb-4 flex flex-wrap gap-1.5">
          {bucket.slugs.map((slug) => (
            <li key={slug}>
              <form action={removeAction} className="contents">
                <input type="hidden" name="bucketId" value={bucket.id} />
                <input type="hidden" name="slug" value={slug} />
                <RemoveChip slug={slug} />
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
          Add a slug to {bucket.label}
        </label>
        <input
          id={`add-slug-${bucket.id}`}
          name="slug"
          type="text"
          placeholder={EXAMPLE_SLUG[bucket.label] ?? "new-slug"}
          maxLength={40}
          autoComplete="off"
          className="min-w-[220px] flex-1 rounded-md border border-bone-800 bg-bone-900/60 px-3 py-1.5 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
        <AddButton />
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

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <SubmitBtn pending={pending} kind="secondary">
      {pending ? "Adding…" : "+ Add slug"}
    </SubmitBtn>
  );
}

function RemoveChip({ slug }: { slug: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border border-bone-800 bg-bone-900 px-3 py-1 text-xs text-bone-100 transition-colors",
        "hover:border-red-500/40 hover:bg-red-900/20 hover:text-red-100",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-50",
      )}
      aria-label={`Remove ${slug}`}
    >
      <span className="font-mono">{slug}</span>
      <span
        aria-hidden
        className="text-bone-400 transition-colors group-hover:text-red-300"
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
  kind: "secondary";
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:cursor-not-allowed disabled:opacity-40",
        kind === "secondary" &&
          "border-bone-800 bg-bone-900/60 text-bone-200 hover:text-bone-50",
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
};

const EXAMPLE_SLUG: Record<string, string> = {
  people: "sidney-sweeney",
  places: "wrigley-field",
  topics: "chicago-bears",
  vibes: "pool-day",
};
