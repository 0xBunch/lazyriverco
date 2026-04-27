import { prisma } from "@/lib/prisma";
import {
  createSponsor,
  deleteSponsor,
  toggleSponsorActive,
  updateSponsor,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { msg?: string; error?: string; edit?: string };

export default async function AdminSportsSponsorsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;
  const editId = searchParams?.edit;

  const sponsors = await prisma.sportsSponsor.findMany({
    orderBy: [{ active: "desc" }, { displayOrder: "asc" }, { createdAt: "desc" }],
  });
  const editing = editId ? sponsors.find((s) => s.id === editId) ?? null : null;
  const activeCount = sponsors.filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      {flashMsg && (
        <p className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-200">
          {flashMsg}
        </p>
      )}
      {flashError && (
        <p className="rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-2 text-sm text-red-200">
          {flashError}
        </p>
      )}

      <p className="text-sm text-bone-300">
        Sponsors surface in two places on /sports — the hero{" "}
        <strong className="font-semibold text-bone-100">Presented By</strong>{" "}
        line and the mid-page broadcast-break rail. Active sponsors rotate by
        hashed UTC date — same brand all day, advances at midnight.{" "}
        <strong className="font-semibold text-bone-100">{activeCount}</strong>{" "}
        active right now.
      </p>

      <form
        action={editing ? updateSponsor : createSponsor}
        className="space-y-3 rounded-2xl border border-bone-700 bg-bone-900 p-5"
      >
        <p className="font-display text-sm font-semibold text-bone-50">
          {editing ? `Edit ${editing.name}` : "Add a sponsor"}
        </p>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            placeholder="Brand (e.g. Gatorade)"
            required
            maxLength={80}
            defaultValue={editing?.name ?? ""}
            className={inputCls}
          />
          <input
            name="displayOrder"
            type="number"
            placeholder="Display order"
            defaultValue={editing?.displayOrder ?? 0}
            className={inputCls}
          />
          <input
            name="tagline"
            placeholder='Tagline (e.g. "Stay in the game.")'
            maxLength={140}
            defaultValue={editing?.tagline ?? ""}
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            name="href"
            type="url"
            placeholder="Click-through URL (optional)"
            maxLength={2048}
            defaultValue={editing?.href ?? ""}
            className={`${inputCls} sm:col-span-2`}
          />
          <label className="flex items-center gap-2 text-sm text-bone-200 sm:col-span-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={editing?.active ?? true}
              className="h-4 w-4 rounded border-bone-700 bg-bone-950 text-claude-500 focus:ring-claude-500"
            />
            Active in rotation
          </label>
        </div>
        <div className="flex justify-end gap-2">
          {editing && (
            <a href="/admin/sports/sponsors" className={btnCls}>
              Cancel
            </a>
          )}
          <button type="submit" className={btnPrimaryCls}>
            {editing ? "Save changes" : "Add sponsor"}
          </button>
        </div>
      </form>

      {sponsors.length === 0 ? (
        <p className="rounded-2xl border border-bone-800 bg-bone-950 p-6 text-center text-sm italic text-bone-400">
          No sponsors yet. Add one above to start the rotation.
        </p>
      ) : (
        <ul className="space-y-2">
          {sponsors.map((s) => (
            <li
              key={s.id}
              className={`rounded-xl border p-4 ${
                s.active
                  ? "border-bone-700 bg-bone-900"
                  : "border-bone-800 bg-bone-950 opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <p className="font-display text-base font-semibold uppercase tracking-tight text-bone-50">
                  {s.name}
                </p>
                <span className="text-[0.7rem] uppercase tracking-widest text-bone-500">
                  sort {s.displayOrder} · {s.active ? "active" : "paused"}
                </span>
              </div>
              {s.tagline && (
                <p className="mt-1 text-sm italic text-bone-300">
                  &ldquo;{s.tagline}&rdquo;
                </p>
              )}
              {s.href && (
                <p className="mt-1 truncate text-xs text-bone-500">
                  →{" "}
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-bone-700 underline-offset-2 hover:text-bone-300"
                  >
                    {s.href}
                  </a>
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/admin/sports/sponsors?edit=${s.id}`} className={btnCls}>
                  Edit
                </a>
                <form action={toggleSponsorActive}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className={btnCls}>
                    {s.active ? "Pause" : "Resume"}
                  </button>
                </form>
                <form action={deleteSponsor}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className={btnDangerCls}>
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500";
const btnPrimaryCls =
  "rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const btnCls =
  "inline-flex items-center rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500";
const btnDangerCls =
  "inline-flex items-center rounded-md border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500";
