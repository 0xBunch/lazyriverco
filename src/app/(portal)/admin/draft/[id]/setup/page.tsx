import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { saveSlots } from "./actions";

export const metadata = { title: "Draft setup · Admin" };

type Search = { msg?: string; error?: string };

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Search;
}) {
  const [draft, users, slots] = await Promise.all([
    prisma.draftRoom.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, slug: true, totalSlots: true, status: true },
    }),
    prisma.user.findMany({
      select: { id: true, displayName: true, name: true },
      orderBy: [{ displayName: "asc" }],
    }),
    prisma.draftSlot.findMany({
      where: { draftId: params.id },
      select: { slotOrder: true, userId: true, teamName: true },
    }),
  ]);

  if (!draft) notFound();

  const slotByOrder = new Map(slots.map((s) => [s.slotOrder, s]));
  const locked = draft.status === "live" || draft.status === "complete";

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
          Slot assignments
        </h2>
        <p className="max-w-2xl text-sm text-bone-300">
          Map each slotOrder (1..{draft.totalSlots}) to a Lazy River user.
          The slot&rsquo;s manager owns the corresponding picks across all
          rounds (snake math handled server-side). Team name is the display
          label used in the Goodell caption — leave blank to fall back to
          the manager&rsquo;s name.
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

      {locked && (
        <div className="rounded-md border border-amber-500/50 bg-amber-900/30 p-3 text-sm text-amber-200">
          Draft is {draft.status}. Pause the draft before editing slots.
        </div>
      )}

      <form action={saveSlots} className="space-y-3">
        <input type="hidden" name="draftId" value={draft.id} />
        <div className="overflow-hidden rounded-2xl border border-bone-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bone-700 bg-bone-900/60 text-left text-[10px] uppercase tracking-[0.18em] text-bone-400">
                <th className="px-3 py-2 w-14">Slot</th>
                <th className="px-3 py-2">Manager (User)</th>
                <th className="px-3 py-2">Team name (optional)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: draft.totalSlots }).map((_, idx) => {
                const slotOrder = idx + 1;
                const current = slotByOrder.get(slotOrder);
                return (
                  <tr key={slotOrder} className="border-b border-bone-800/50 bg-bone-900/30">
                    <td className="px-3 py-2 font-mono text-bone-300">{slotOrder}</td>
                    <td className="px-3 py-2">
                      <select
                        name={`slot_${slotOrder}_userId`}
                        defaultValue={current?.userId ?? ""}
                        disabled={locked}
                        className="w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-1.5 text-sm text-bone-50 outline-none focus-visible:border-claude-400 disabled:opacity-50"
                      >
                        <option value="">— unassigned —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName} ({u.name})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        name={`slot_${slotOrder}_teamName`}
                        defaultValue={current?.teamName ?? ""}
                        disabled={locked}
                        maxLength={80}
                        placeholder="e.g. Austin Bats"
                        className="w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-1.5 text-sm text-bone-50 outline-none focus-visible:border-claude-400 disabled:opacity-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!locked && (
          <button
            type="submit"
            className="rounded-md bg-claude-500 px-4 py-2 text-sm font-semibold text-bone-950 transition hover:bg-claude-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
          >
            Save slots
          </button>
        )}
      </form>
    </div>
  );
}

function humanMsg(msg: string | undefined): string {
  switch (msg) {
    case "slots-saved":
      return "Slot assignments saved.";
    default:
      return msg ?? "";
  }
}
