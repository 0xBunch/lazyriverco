import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isDraft2026Enabled } from "@/lib/draft-flags";
import { createDraft } from "./actions";

export const metadata = {
  title: "Draft · Admin",
};

// ---------------------------------------------------------------------------
// /admin/sports/mlf/draft — list existing draft rooms + create a new one.
//
// v1 scope: ship enough to create a DraftRoom and see it listed. Slot
// mapping, sponsor management, image-pool uploads, live cockpit all
// layer in under /admin/sports/mlf/draft/[id]/* in follow-up PRs. The feature flag
// (DRAFT_2026_ENABLED) doesn't gate this page — commissioners can set up
// in the background. It gates the public /sports/mlf/draft-2026 view.
// ---------------------------------------------------------------------------

type Search = {
  msg?: string;
  error?: string;
};

export default async function AdminDraftPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const drafts = await prisma.draftRoom.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: {
        select: { slots: true, picks: true, pool: true, sponsors: true, announcerImgs: true },
      },
    },
  });

  const flagOn = isDraft2026Enabled();

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight text-bone-50">
          Draft rooms
        </h2>
        <p className="max-w-2xl text-sm text-bone-300">
          One DraftRoom per draft event (e.g., <code className="rounded bg-bone-900 px-1.5 py-0.5 text-[0.8em] text-bone-100">mlf-2026</code>{" "}
          for the 2026 Mens League rookie draft). Creating a room seeds only
          the top-level config — slot assignments, rookie pool, image pool,
          sponsors, and the pick grid are built up in the detail page.
        </p>
        <p className="text-xs text-bone-400">
          Public draft page is{" "}
          <span
            className={
              flagOn
                ? "rounded bg-emerald-900/40 px-1.5 py-0.5 font-mono text-emerald-300"
                : "rounded bg-bone-900 px-1.5 py-0.5 font-mono text-bone-300"
            }
          >
            DRAFT_2026_ENABLED={flagOn ? "true" : "false"}
          </span>
          {!flagOn && " — set the env var on Railway to flip it on."}
        </p>
      </header>

      {(searchParams.msg || searchParams.error) && (
        <div
          className={
            searchParams.error
              ? "rounded-md border border-red-500/50 bg-red-900/30 p-3 text-sm text-red-200"
              : "rounded-md border border-emerald-500/50 bg-emerald-900/30 p-3 text-sm text-emerald-200"
          }
        >
          {searchParams.error ?? flashSuccessLabel(searchParams.msg)}
        </div>
      )}

      {drafts.length === 0 ? (
        <p className="rounded-md border border-dashed border-bone-700 p-6 text-sm italic text-bone-400">
          No drafts yet. Create one below to get started.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="rounded-2xl border border-bone-700 bg-bone-900 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/admin/sports/mlf/draft/${d.id}`}
                    className="font-display text-lg font-semibold text-bone-50 hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
                  >
                    {d.name} →
                  </Link>
                  <p className="mt-1 font-mono text-xs text-bone-400">
                    {d.slug} · season {d.season}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusBadge(d.status)}`}
                >
                  {d.status}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-5 gap-2 text-xs text-bone-300">
                <StatPair label="Rounds" value={d.totalRounds} />
                <StatPair label="Slots" value={d._count.slots}>
                  <span className="text-bone-500">
                    {" "}
                    / {d.totalSlots}
                  </span>
                </StatPair>
                <StatPair label="Picks" value={d._count.picks} />
                <StatPair label="Pool" value={d._count.pool} />
                <StatPair label="Sponsors" value={d._count.sponsors} />
              </dl>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Create a draft
        </h3>
        <p className="mt-1 text-xs text-bone-400">
          The slug becomes the URL key ({" "}
          <code className="rounded bg-bone-800 px-1 py-0.5 font-mono text-[0.85em]">
            /sports/mlf/draft-2026
          </code>{" "}
          for slug <code className="font-mono">mlf-2026</code>). Status
          starts as <code className="font-mono">setup</code> — the draft
          only goes live when flipped in the detail page.
        </p>
        <form action={createDraft} className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Slug" hint="lowercase, dashes — e.g. mlf-2026">
            <input
              type="text"
              name="slug"
              required
              autoComplete="off"
              pattern="^[a-z0-9-]{2,64}$"
              placeholder="mlf-2026"
              className="w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </Field>
          <Field label="Name" hint="display name">
            <input
              type="text"
              name="name"
              required
              maxLength={120}
              placeholder="MLF Rookie Draft 2026"
              className="w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </Field>
          <Field label="Season" hint="year string, matches PlayerSeasonStats.season">
            <input
              type="text"
              name="season"
              required
              maxLength={8}
              defaultValue="2026"
              placeholder="2026"
              className="w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </Field>
          <Field label="Pick clock (hours)" hint="soft deadline, no auto-pick">
            <input
              type="number"
              name="pickClockHours"
              min={1}
              max={168}
              defaultValue={24}
              className="w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </Field>
          <Field label="Total rounds" hint="1–20; snake math baked in">
            <input
              type="number"
              name="totalRounds"
              min={1}
              max={20}
              defaultValue={3}
              className="w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </Field>
          <Field label="Total slots" hint="manager seats; 2–32">
            <input
              type="number"
              name="totalSlots"
              min={2}
              max={32}
              defaultValue={8}
              className="w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </Field>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-claude-500 px-4 py-2 text-sm font-semibold text-bone-950 transition hover:bg-claude-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
            >
              Create draft
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-bone-100">{label}</span>
      {hint && <span className="text-xs text-bone-400">{hint}</span>}
      {children}
    </label>
  );
}

function StatPair({
  label,
  value,
  children,
}: {
  label: string;
  value: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-500">
        {label}
      </dt>
      <dd className="font-mono text-sm text-bone-100 tabular-nums">
        {value}
        {children}
      </dd>
    </div>
  );
}

function statusBadge(status: string): string {
  switch (status) {
    case "live":
      return "bg-emerald-900/60 text-emerald-200";
    case "paused":
      return "bg-amber-900/60 text-amber-200";
    case "complete":
      return "bg-bone-800 text-bone-300";
    case "setup":
    default:
      return "bg-claude-900/40 text-claude-200";
  }
}

function flashSuccessLabel(msg: string | undefined): string {
  switch (msg) {
    case "created":
      return "Draft created.";
    case "deleted":
      return "Draft deleted.";
    case "updated":
      return "Draft updated.";
    default:
      return msg ?? "";
  }
}
