import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addSponsor,
  toggleSponsorActive,
  deleteSponsor,
  reorderSponsor,
} from "./actions";

export const metadata = { title: "Sponsors · Admin" };

type Search = { msg?: string; error?: string };

export default async function SponsorsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Search;
}) {
  const draft = await prisma.draftRoom.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!draft) notFound();

  const sponsors = await prisma.draftSponsor.findMany({
    where: { draftId: draft.id },
    orderBy: [{ displayOrder: "asc" }],
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/admin/draft/${draft.id}`}
          className="text-xs uppercase tracking-[0.18em] text-bone-400 hover:text-bone-200"
        >
          ← {draft.name}
        </Link>
        <h2 className="font-display text-xl font-semibold tracking-tight text-bone-50">
          Sponsor rotation
        </h2>
        <p className="max-w-2xl text-sm text-bone-300">
          Powers the rotating card alongside the on-clock panel. Active
          entries cycle in display order; inactive ones stay on file but
          don&rsquo;t render. Draft-scoped — nothing persists across drafts.
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
          {searchParams.error ?? searchParams.msg}
        </div>
      )}

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Add sponsor
        </h3>
        <form
          action={addSponsor}
          className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr_auto]"
        >
          <input type="hidden" name="draftId" value={draft.id} />
          <div>
            <label className="text-xs font-medium text-bone-200" htmlFor="sp-name">
              Name
            </label>
            <input
              id="sp-name"
              type="text"
              name="name"
              required
              maxLength={80}
              placeholder="Station Wagon Motors"
              className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-bone-200" htmlFor="sp-tag">
              Tagline
            </label>
            <input
              id="sp-tag"
              type="text"
              name="tagline"
              maxLength={200}
              placeholder="Moving the league since 2018."
              className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-[38px] rounded-md bg-claude-500 px-4 text-sm font-semibold text-bone-950 transition hover:bg-claude-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Rotation ({sponsors.length})
        </h3>
        {sponsors.length === 0 ? (
          <p className="mt-3 italic text-sm text-bone-400">
            No sponsors yet. Pull up the form above and put one on the board.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {sponsors.map((s, idx) => (
              <li
                key={s.id}
                className={
                  s.active
                    ? "flex items-center gap-3 rounded-md border border-bone-800 bg-bone-950/50 px-3 py-2"
                    : "flex items-center gap-3 rounded-md border border-bone-800/40 bg-bone-950/20 px-3 py-2 opacity-60"
                }
              >
                <span className="w-6 font-mono text-xs tabular-nums text-bone-500">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <div className="font-display text-sm font-semibold text-bone-50">
                    {s.name}
                  </div>
                  {s.tagline && (
                    <div className="text-xs italic text-bone-300">
                      &ldquo;{s.tagline}&rdquo;
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <ReorderForm id={s.id} draftId={draft.id} direction="up" disabled={idx === 0} />
                  <ReorderForm
                    id={s.id}
                    draftId={draft.id}
                    direction="down"
                    disabled={idx === sponsors.length - 1}
                  />
                  <form action={toggleSponsorActive} className="contents">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="draftId" value={draft.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-bone-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-bone-300 hover:text-bone-50"
                    >
                      {s.active ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteSponsor} className="contents">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="draftId" value={draft.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-bone-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-bone-300 hover:border-red-500/50 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ReorderForm({
  id,
  draftId,
  direction,
  disabled,
}: {
  id: string;
  draftId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={reorderSponsor} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Move ${direction}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-bone-700 text-bone-400 transition hover:text-bone-50 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {direction === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}
