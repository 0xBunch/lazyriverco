import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deleteDraft } from "../actions";
import { openDraft, pauseDraft, resumeDraft, completeDraft, resetDraft } from "./actions";

// ---------------------------------------------------------------------------
// /admin/draft/[id] — single-draft landing page.
//
// v1 scope: show top-level config + counts + a destructive "delete" action
// (gated by typing DELETE). Setup sub-surfaces (slots, pool, images,
// sponsors, live cockpit) are hinted but ship in follow-up PRs:
//
//   /admin/draft/[id]/setup    — slot-to-user mapping, team-name overrides
//   /admin/draft/[id]/pool     — rookie pool add/remove
//   /admin/draft/[id]/images   — Goodell image pool uploads
//   /admin/draft/[id]/sponsors — sponsor rotation entries
//   /admin/draft/[id]/live     — commissioner cockpit (undo, skip, etc.)
// ---------------------------------------------------------------------------

type Search = {
  msg?: string;
  error?: string;
};

export default async function AdminDraftDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Search;
}) {
  const draft = await prisma.draftRoom.findUnique({
    where: { id: params.id },
    include: {
      _count: {
        select: {
          slots: true,
          picks: true,
          pool: true,
          sponsors: true,
          announcerImgs: true,
        },
      },
    },
  });

  if (!draft) notFound();

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/draft"
          className="text-xs uppercase tracking-[0.18em] text-bone-400 hover:text-bone-200"
        >
          ← All drafts
        </Link>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight text-bone-50">
            {draft.name}
          </h2>
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
              draft.status === "live"
                ? "bg-emerald-900/60 text-emerald-200"
                : draft.status === "paused"
                ? "bg-amber-900/60 text-amber-200"
                : draft.status === "complete"
                ? "bg-bone-800 text-bone-300"
                : "bg-claude-900/40 text-claude-200"
            }`}
          >
            {draft.status}
          </span>
        </div>
        <p className="font-mono text-xs text-bone-400">
          {draft.slug} · season {draft.season} · created{" "}
          {draft.createdAt.toISOString().slice(0, 10)}
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
          {searchParams.error ?? humanMsg(searchParams.msg)}
        </div>
      )}

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Configuration
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Total rounds" value={draft.totalRounds.toString()} />
          <Stat label="Total slots" value={draft.totalSlots.toString()} />
          <Stat label="Snake" value={draft.snake ? "yes" : "no"} />
          <Stat
            label="Pick clock"
            value={`${Math.round(draft.pickClockSec / 3600)}h`}
          />
          <Stat label="Slots assigned" value={`${draft._count.slots} / ${draft.totalSlots}`} />
          <Stat label="Picks made" value={`${draft._count.picks} / ${draft.totalRounds * draft.totalSlots}`} />
          <Stat label="Rookie pool" value={draft._count.pool.toString()} />
          <Stat label="Sponsors" value={draft._count.sponsors.toString()} />
          <Stat label="Announcer images" value={draft._count.announcerImgs.toString()} />
          <Stat label="Opened" value={draft.openedAt ? draft.openedAt.toISOString().slice(0, 16).replace("T", " ") : "—"} />
          <Stat label="Closed" value={draft.closedAt ? draft.closedAt.toISOString().slice(0, 16).replace("T", " ") : "—"} />
        </dl>
      </section>

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Setup surfaces
        </h3>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <SubLink
            href={`/admin/draft/${draft.id}/setup`}
            title="Slots"
            body={`${draft._count.slots} / ${draft.totalSlots} assigned`}
          />
          <SubLink
            href={`/admin/draft/${draft.id}/pool`}
            title="Rookie pool"
            body={`${draft._count.pool} rookies staged`}
          />
          <SubLink
            href={`/admin/draft/${draft.id}/images`}
            title="Announcer images"
            body={`${draft._count.announcerImgs} uploaded`}
          />
          <SubLink
            href={`/admin/draft/${draft.id}/sponsors`}
            title="Sponsors"
            body={`${draft._count.sponsors} on rotation`}
          />
        </ul>
      </section>

      <StatusSection draft={draft} />

      <section className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-5">
        <h3 className="font-display text-base font-semibold text-amber-200">
          Reset draft
        </h3>
        <p className="mt-1 text-xs text-bone-400">
          Wipes all picks (and their reactions) + frees up the announcer
          image rotation + flips status back to <code className="font-mono">setup</code>.
          Keeps slots, pool, sponsors, images, and shadow pre-seeds —
          you can &ldquo;Open draft&rdquo; again right after to start over with
          the same setup. Type RESET to confirm.
        </p>
        <form action={resetDraft} className="mt-3 flex items-center gap-3">
          <input type="hidden" name="draftId" value={draft.id} />
          <input
            type="text"
            name="confirm"
            placeholder="type RESET"
            required
            className="w-40 rounded-md border border-amber-500/40 bg-bone-950 px-3 py-2 font-mono text-sm text-bone-50 outline-none focus-visible:border-amber-400"
          />
          <button
            type="submit"
            className="rounded-md border border-amber-500/60 bg-amber-900/40 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Reset draft
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-red-500/40 bg-red-950/30 p-5">
        <h3 className="font-display text-base font-semibold text-red-200">
          Delete draft
        </h3>
        <p className="mt-1 text-xs text-bone-400">
          Cascades slots, picks, pool, images, sponsors. Scouting reports
          survive (they&rsquo;re player-scoped, not draft-scoped). Type DELETE
          to confirm — no undo.
        </p>
        <form action={deleteDraft} className="mt-3 flex items-center gap-3">
          <input type="hidden" name="id" value={draft.id} />
          <input
            type="text"
            name="confirm"
            placeholder="type DELETE"
            required
            className="w-40 rounded-md border border-red-500/40 bg-bone-950 px-3 py-2 font-mono text-sm text-bone-50 outline-none focus-visible:border-red-400"
          />
          <button
            type="submit"
            className="rounded-md border border-red-500/60 bg-red-900/40 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Delete draft
          </button>
        </form>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-500">
        {label}
      </dt>
      <dd className="font-mono text-sm text-bone-100 tabular-nums">{value}</dd>
    </div>
  );
}

function SubLink({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <li className="group rounded-md border border-bone-800 bg-bone-950/50 p-3 transition hover:border-claude-500/50 hover:bg-bone-950">
      <Link
        href={href}
        className="flex items-center justify-between gap-3 focus:outline-none"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-bone-100 group-hover:text-claude-200">
            {title}
          </div>
          <p className="mt-1 text-xs text-bone-400">{body}</p>
        </div>
        <span className="text-bone-500 transition group-hover:text-claude-300">
          →
        </span>
      </Link>
    </li>
  );
}

function StatusSection({
  draft,
}: {
  draft: {
    id: string;
    status: string;
    totalSlots: number;
    totalRounds: number;
    _count: { slots: number; picks: number; pool: number };
  };
}) {
  const slotsReady = draft._count.slots === draft.totalSlots;
  const poolReady = draft._count.pool > 0;
  const canOpen = draft.status === "setup" && slotsReady && poolReady;
  const canPause = draft.status === "live";
  const canResume = draft.status === "paused";
  const canComplete = draft.status === "live" || draft.status === "paused";

  return (
    <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
      <h3 className="font-display text-base font-semibold text-bone-50">
        Status
      </h3>
      <p className="mt-1 text-xs text-bone-400">
        Currently <code className="rounded bg-bone-800 px-1.5 py-0.5 font-mono text-bone-100">{draft.status}</code>.
        Opening the draft materializes{" "}
        <span className="font-mono tabular-nums">
          {draft.totalRounds * draft.totalSlots}
        </span>{" "}
        picks from the snake order and flips pick 1.01 to on-clock.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canOpen ? (
          <form action={openDraft}>
            <input type="hidden" name="draftId" value={draft.id} />
            <button
              type="submit"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Open draft
            </button>
          </form>
        ) : (
          draft.status === "setup" && (
            <span className="text-xs italic text-bone-400">
              Fill all {draft.totalSlots} slots and seed the pool before
              opening.
            </span>
          )
        )}
        {canPause && (
          <form action={pauseDraft}>
            <input type="hidden" name="draftId" value={draft.id} />
            <button
              type="submit"
              className="rounded-md border border-amber-500/60 bg-amber-900/40 px-3 py-1.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-900/60"
            >
              Pause
            </button>
          </form>
        )}
        {canResume && (
          <form action={resumeDraft}>
            <input type="hidden" name="draftId" value={draft.id} />
            <button
              type="submit"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-600"
            >
              Resume
            </button>
          </form>
        )}
        {canComplete && (
          <form action={completeDraft}>
            <input type="hidden" name="draftId" value={draft.id} />
            <button
              type="submit"
              className="rounded-md border border-bone-700 px-3 py-1.5 text-sm font-semibold text-bone-200 transition hover:border-claude-500/60 hover:text-claude-200"
            >
              Mark complete
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Hint({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded-md border border-bone-800 bg-bone-950/50 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-bone-200">
        {title}
      </div>
      <p className="mt-1 text-xs leading-snug text-bone-400">{body}</p>
    </li>
  );
}

function humanMsg(msg: string | undefined): string {
  switch (msg) {
    case "created":
      return "Draft created.";
    case "updated":
      return "Draft updated.";
    case "draft-opened":
      return "Draft opened. Pick 1.01 is on the clock.";
    case "paused":
      return "Draft paused.";
    case "resumed":
      return "Draft resumed.";
    case "completed":
      return "Draft marked complete.";
    case "reset":
      return "Draft reset back to setup.";
    default:
      return msg ?? "";
  }
}
