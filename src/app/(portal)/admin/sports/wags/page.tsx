import { prisma } from "@/lib/prisma";
import { deleteWag, toggleWagHidden } from "./actions";
import { WagForm } from "./WagForm";
import { isPartnersEnabled } from "@/lib/player-partner";

export const dynamic = "force-dynamic";

type SearchParams = { msg?: string; error?: string; edit?: string };

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
        {isPartnersEnabled() ? (
          <>
            {" "}
            Click <strong className="font-semibold text-bone-100">
              Auto-fill from athlete name
            </strong>{" "}
            after entering an athlete to pre-populate from the same
            Gemini + Google Search pipeline that powers WAGFINDER.
          </>
        ) : (
          <>
            {" "}
            <span className="italic text-bone-400">
              Auto-fill is disabled (SLEEPER_PARTNERS_ENABLED is off).
            </span>
          </>
        )}
      </p>

      <WagForm
        editing={editing}
        r2PublicBase={process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? ""}
      />

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

const btnCls =
  "inline-flex items-center rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500";
const btnDangerCls =
  "inline-flex items-center rounded-md border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500";
