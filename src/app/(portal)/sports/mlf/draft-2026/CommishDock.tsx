import Link from "next/link";
import { pauseDraftFromLive, resumeDraftFromLive } from "./actions";

// Inline commissioner controls. Sticky bottom-right, admin-only.
//
// v1 surfaces just pause/resume — the safe, fully-reversible toggle.
// Destructive actions (skip pick, undo last pick) need the confirm-
// modal pattern from PR 2 (#90) to be merged before they ship here;
// then we add them in a follow-up.

const NAVY_700 = "#1B3A66";
const NAVY_800 = "#12294A";
const NAVY_900 = "#0B1A33";
const RED_500 = "#C8102E";
const RED_400 = "#E23A52";
const RED_900 = "#4A0914";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

type Props = {
  draftId: string;
  status: "live" | "paused";
};

export function CommishDock({ draftId, status }: Props) {
  const isPaused = status === "paused";

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 rounded-sm border p-3 text-[10px] font-bold uppercase tracking-[0.18em] shadow-2xl backdrop-blur md:bottom-6 md:right-6 md:flex-row md:items-center md:gap-3 md:px-4"
      style={{
        borderColor: NAVY_700,
        backgroundColor: `${NAVY_900}F0`,
        color: CREAM_200,
      }}
      aria-label="Commissioner controls"
    >
      <span
        className="flex items-center gap-1.5"
        style={{ color: isPaused ? "#EABF7A" : RED_400 }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: isPaused ? "#EABF7A" : RED_500 }}
        />
        Commish · {isPaused ? "Paused" : "Live"}
      </span>

      <span
        aria-hidden
        className="hidden h-3 w-px md:block"
        style={{ backgroundColor: NAVY_700 }}
      />

      {isPaused ? (
        <form action={resumeDraftFromLive}>
          <input type="hidden" name="draftId" value={draftId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-sm px-3 py-1.5 transition hover:brightness-110 focus:outline-none"
            style={{
              backgroundColor: RED_500,
              color: CREAM_50,
              boxShadow: `0 0 0 1px ${RED_400}`,
            }}
          >
            ▶ Resume
          </button>
        </form>
      ) : (
        <form action={pauseDraftFromLive}>
          <input type="hidden" name="draftId" value={draftId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-sm px-3 py-1.5 transition hover:brightness-110 focus:outline-none"
            style={{
              backgroundColor: NAVY_800,
              color: CREAM_50,
              boxShadow: `0 0 0 1px ${NAVY_700}`,
            }}
          >
            ❚❚ Pause
          </button>
        </form>
      )}

      <Link
        href={`/admin/sports/mlf/draft/${draftId}`}
        className="rounded-sm px-2 py-1.5 transition hover:brightness-125 focus:outline-none"
        style={{ color: CREAM_400 }}
      >
        More controls →
      </Link>

      <span
        aria-hidden
        className="hidden h-3 w-px md:block"
        style={{ backgroundColor: RED_900 }}
      />
    </div>
  );
}
