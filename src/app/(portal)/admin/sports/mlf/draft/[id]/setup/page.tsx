import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { saveSlots, createShadowUser } from "./actions";

export const metadata = { title: "Draft setup · Admin" };

type Search = { msg?: string; error?: string };

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Search;
}) {
  const [draft, users, slots, poolRows, shadowPicks] = await Promise.all([
    prisma.draftRoom.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        slug: true,
        totalSlots: true,
        totalRounds: true,
        status: true,
      },
    }),
    // Order: real users first, then shadows (passwordHash=null) bottom of
    // the dropdown so KB sees his league first but can still reach
    // shadow rows easily.
    prisma.user.findMany({
      select: { id: true, displayName: true, name: true, passwordHash: true },
      orderBy: [{ displayName: "asc" }],
    }),
    prisma.draftSlot.findMany({
      where: { draftId: params.id },
      select: {
        id: true,
        slotOrder: true,
        userId: true,
        teamName: true,
        isShadow: true,
      },
    }),
    prisma.draftPoolPlayer.findMany({
      where: { draftId: params.id, removed: false },
      include: {
        player: {
          select: {
            playerId: true,
            fullName: true,
            position: true,
            team: true,
          },
        },
      },
    }),
    prisma.draftShadowPick.findMany({
      where: { draftId: params.id },
      select: { slotId: true, round: true, playerId: true },
    }),
  ]);

  if (!draft) notFound();

  const slotByOrder = new Map(slots.map((s) => [s.slotOrder, s]));

  // Shadow picks indexed by "slotId:round" for O(1) lookup during render.
  const shadowByKey = new Map<string, string>();
  for (const sp of shadowPicks) {
    shadowByKey.set(`${sp.slotId}:${sp.round}`, sp.playerId);
  }

  const locked = draft.status === "live" || draft.status === "complete";

  // Pool sorted alphabetically by name for the shadow picker dropdowns.
  const poolSorted = [...poolRows].sort((a, b) => {
    const an = a.player.fullName ?? "";
    const bn = b.player.fullName ?? "";
    return an.localeCompare(bn);
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/admin/sports/mlf/draft/${draft.id}`}
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

      {/* Add shadow manager — lives at the top so KB can create OORFV/Joey
          once, then assign in the slot rows below. */}
      <section className="rounded-2xl border border-bone-700 bg-bone-900 p-5">
        <h3 className="font-display text-base font-semibold text-bone-50">
          Add shadow manager
        </h3>
        <p className="mt-1 text-xs text-bone-400">
          Create a placeholder user for a manager without a Lazy River
          account (e.g., Joey / OORFV). Shadow users can&rsquo;t log in —
          you pre-select their picks below, and openDraft locks them
          immediately so the snake advances past them without waiting.
        </p>
        <form action={createShadowUser} className="mt-3 flex items-end gap-3">
          <input type="hidden" name="draftId" value={draft.id} />
          <div className="flex-1">
            <label className="text-xs font-medium text-bone-200" htmlFor="shadow-display-name">
              Display name
            </label>
            <input
              id="shadow-display-name"
              type="text"
              name="displayName"
              required
              maxLength={60}
              placeholder="Joey"
              className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-claude-500 px-4 py-2 text-sm font-semibold text-bone-950 transition hover:bg-claude-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
          >
            Create
          </button>
        </form>
      </section>

      <form action={saveSlots} className="space-y-3">
        <input type="hidden" name="draftId" value={draft.id} />
        <ul className="space-y-3">
          {Array.from({ length: draft.totalSlots }).map((_, idx) => {
            const slotOrder = idx + 1;
            const current = slotByOrder.get(slotOrder);
            // Pre-fill the shadow picks if the slot already exists.
            const shadowSelections: Record<number, string> = {};
            if (current) {
              for (let r = 1; r <= draft.totalRounds; r++) {
                const playerId = shadowByKey.get(`${current.id}:${r}`);
                if (playerId) shadowSelections[r] = playerId;
              }
            }
            return (
              <SlotCard
                key={slotOrder}
                slotOrder={slotOrder}
                current={current ?? null}
                users={users}
                locked={locked}
                totalRounds={draft.totalRounds}
                pool={poolSorted}
                shadowSelections={shadowSelections}
              />
            );
          })}
        </ul>
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

function SlotCard({
  slotOrder,
  current,
  users,
  locked,
  totalRounds,
  pool,
  shadowSelections,
}: {
  slotOrder: number;
  current: {
    id: string;
    userId: string;
    teamName: string | null;
    isShadow: boolean;
  } | null;
  users: Array<{
    id: string;
    displayName: string;
    name: string;
    passwordHash: string | null;
  }>;
  locked: boolean;
  totalRounds: number;
  pool: Array<{
    player: {
      playerId: string;
      fullName: string | null;
      position: string | null;
      team: string | null;
    };
  }>;
  shadowSelections: Record<number, string>;
}) {
  return (
    <li className="rounded-2xl border border-bone-700 bg-bone-900 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex items-center gap-3 md:w-20">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-bone-400">
            Slot
          </span>
          <span className="font-display text-lg font-semibold text-bone-100 tabular-nums">
            {String(slotOrder).padStart(2, "0")}
          </span>
        </div>

        <div className="flex-1">
          <label
            className="text-xs font-medium text-bone-200"
            htmlFor={`slot_${slotOrder}_userId`}
          >
            Manager
          </label>
          <select
            id={`slot_${slotOrder}_userId`}
            name={`slot_${slotOrder}_userId`}
            defaultValue={current?.userId ?? ""}
            disabled={locked}
            className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400 disabled:opacity-50"
          >
            <option value="">— unassigned —</option>
            {users
              .filter((u) => u.passwordHash !== null)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.name})
                </option>
              ))}
            {users.some((u) => u.passwordHash === null) && (
              <optgroup label="Shadow managers">
                {users
                  .filter((u) => u.passwordHash === null)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="flex-1">
          <label
            className="text-xs font-medium text-bone-200"
            htmlFor={`slot_${slotOrder}_teamName`}
          >
            Team name
          </label>
          <input
            id={`slot_${slotOrder}_teamName`}
            type="text"
            name={`slot_${slotOrder}_teamName`}
            defaultValue={current?.teamName ?? ""}
            disabled={locked}
            maxLength={80}
            placeholder="e.g. Austin Bats"
            className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 outline-none focus-visible:border-claude-400 disabled:opacity-50"
          />
        </div>

        <div className="md:pb-1">
          <label className="flex items-center gap-2 text-xs font-medium text-bone-200">
            <input
              type="checkbox"
              name={`slot_${slotOrder}_isShadow`}
              defaultChecked={current?.isShadow ?? false}
              disabled={locked}
              className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500 disabled:opacity-50"
            />
            Shadow slot
          </label>
        </div>
      </div>

      {/* Shadow-pick pickers. Shown when the slot is flagged shadow.
          Because this is a server component we can't conditionally
          hide based on the checkbox's client state — we always render
          them and let the commissioner fill in. If the shadow
          checkbox is off on save, the action drops any submitted
          picks. A future enhancement: a small client-island that
          hides/shows per checkbox state. */}
      <details
        open={current?.isShadow ?? false}
        className="mt-3 rounded-md border border-bone-800 bg-bone-950/40 p-3"
      >
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-bone-300">
          Shadow pre-seed picks
          <span className="ml-2 font-mono text-[10px] text-bone-500">
            (applies only when &ldquo;Shadow slot&rdquo; is checked)
          </span>
        </summary>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {Array.from({ length: totalRounds }).map((_, rIdx) => {
            const round = rIdx + 1;
            const sel = shadowSelections[round] ?? "";
            return (
              <div key={round}>
                <label
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-400"
                  htmlFor={`slot_${slotOrder}_shadow_r${round}_playerId`}
                >
                  Round {round}
                </label>
                <select
                  id={`slot_${slotOrder}_shadow_r${round}_playerId`}
                  name={`slot_${slotOrder}_shadow_r${round}_playerId`}
                  defaultValue={sel}
                  disabled={locked}
                  className="mt-1 w-full rounded-md border border-bone-700 bg-bone-950 px-2 py-1.5 text-xs text-bone-50 outline-none focus-visible:border-claude-400 disabled:opacity-50"
                >
                  <option value="">— none —</option>
                  {pool.map((row) => (
                    <option key={row.player.playerId} value={row.player.playerId}>
                      {row.player.fullName} · {row.player.position} · {row.player.team}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        {pool.length === 0 && (
          <p className="mt-2 text-xs italic text-bone-400">
            No rookies in the pool yet. Seed the pool first at{" "}
            <code className="rounded bg-bone-900 px-1.5 py-0.5">
              /admin/sports/mlf/draft/[id]/pool
            </code>
            , then come back to select shadow picks.
          </p>
        )}
      </details>
    </li>
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
