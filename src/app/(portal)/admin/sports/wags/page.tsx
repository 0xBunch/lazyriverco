import { prisma } from "@/lib/prisma";
import { createWag, deleteWag, toggleWagHidden, updateWag } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { msg?: string; error?: string; edit?: string };

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const;

export default async function AdminSportsWagsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;
  const editId = searchParams?.edit;

  const wags = await prisma.sportsWag.findMany({
    orderBy: [{ hidden: "asc" }, { createdAt: "desc" }],
  });
  const editing = editId ? wags.find((w) => w.id === editId) ?? null : null;

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
        Curated cross-sport partner roster for the /sports{" "}
        <strong className="font-semibold text-bone-100">WAG of the Day</strong>{" "}
        module. Add entries here, then schedule which one features on which
        date in the{" "}
        <a
          href="/admin/sports/wags/queue"
          className="text-claude-300 underline decoration-claude-700 underline-offset-2 hover:text-claude-200"
        >
          queue
        </a>
        . Hidden entries are skipped even when scheduled.
      </p>

      {/* Create / edit form */}
      <form
        action={editing ? updateWag : createWag}
        className="space-y-3 rounded-2xl border border-bone-700 bg-bone-900 p-5"
      >
        <p className="font-display text-sm font-semibold text-bone-50">
          {editing ? `Edit ${editing.name}` : "Add a WAG"}
        </p>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            placeholder="Partner name (e.g. Ciara Wilson)"
            required
            maxLength={120}
            defaultValue={editing?.name ?? ""}
            className={inputCls}
          />
          <input
            name="athleteName"
            placeholder="Athlete name (e.g. Russell Wilson)"
            required
            maxLength={120}
            defaultValue={editing?.athleteName ?? ""}
            className={inputCls}
          />
          <select
            name="sport"
            required
            defaultValue={editing?.sport ?? "NFL"}
            className={inputCls}
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            name="team"
            placeholder="Team (optional, e.g. Pittsburgh Steelers)"
            maxLength={80}
            defaultValue={editing?.team ?? ""}
            className={inputCls}
          />
          <input
            name="imageUrl"
            type="url"
            placeholder="https://… image URL"
            required
            maxLength={2048}
            defaultValue={editing?.imageUrl ?? ""}
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            name="instagramUrl"
            type="url"
            placeholder="Instagram URL (optional)"
            maxLength={80}
            defaultValue={editing?.instagramUrl ?? ""}
            className={inputCls}
          />
          <input
            name="caption"
            placeholder="Editorial caption (optional, ≤280 chars)"
            maxLength={280}
            defaultValue={editing?.caption ?? ""}
            className={inputCls}
          />
        </div>
        <div className="flex justify-end gap-2">
          {editing && (
            <a
              href="/admin/sports/wags"
              className="rounded-lg border border-bone-700 px-4 py-2 text-sm text-bone-300 hover:bg-bone-800"
            >
              Cancel
            </a>
          )}
          <button
            type="submit"
            className="rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          >
            {editing ? "Save changes" : "Add WAG"}
          </button>
        </div>
      </form>

      {/* List */}
      {wags.length === 0 ? (
        <p className="rounded-2xl border border-bone-800 bg-bone-950 p-6 text-center text-sm italic text-bone-400">
          No WAGs yet. Add one above to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {wags.map((wag) => (
            <li
              key={wag.id}
              className={`flex items-start gap-4 rounded-2xl border p-4 ${
                wag.hidden
                  ? "border-bone-800 bg-bone-950 opacity-60"
                  : "border-bone-700 bg-bone-900"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wag.imageUrl}
                alt=""
                className="h-20 w-16 flex-shrink-0 rounded-md object-cover ring-1 ring-bone-800"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="font-display text-base font-semibold text-bone-50">
                    {wag.name}
                  </p>
                  <span className="rounded-md bg-bone-800 px-2 py-0.5 text-[0.7rem] font-mono text-bone-300">
                    {wag.sport}
                  </span>
                  {wag.hidden && (
                    <span className="text-[0.7rem] uppercase tracking-widest text-bone-500">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-bone-300">
                  {wag.athleteName}
                  {wag.team ? ` · ${wag.team}` : ""}
                </p>
                {wag.caption && (
                  <p className="mt-2 text-sm italic text-bone-400">
                    &ldquo;{wag.caption}&rdquo;
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/admin/sports/wags?edit=${wag.id}`}
                    className={btnCls}
                  >
                    Edit
                  </a>
                  <form action={toggleWagHidden}>
                    <input type="hidden" name="id" value={wag.id} />
                    <button type="submit" className={btnCls}>
                      {wag.hidden ? "Unhide" : "Hide"}
                    </button>
                  </form>
                  <form action={deleteWag}>
                    <input type="hidden" name="id" value={wag.id} />
                    <button type="submit" className={btnDangerCls}>
                      Delete
                    </button>
                  </form>
                </div>
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
const btnCls =
  "inline-flex items-center rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500";
const btnDangerCls =
  "inline-flex items-center rounded-md border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500";
