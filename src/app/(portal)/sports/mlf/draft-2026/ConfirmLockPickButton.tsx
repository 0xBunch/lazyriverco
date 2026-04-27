"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { FocusTrap } from "@/components/FocusTrap";
import { lockPick } from "./actions";

// Confirm-pick gate. Manager (or admin pick-on-behalf) clicks the
// in-row Lock pick → dialog opens with player preview → Cancel or
// Confirm. Confirm submits the existing `lockPick` server action via
// the form inside the dialog. Pattern mirrors AddDateDialog: FocusTrap
// for keyboard containment, useFormStatus for pending state, click
// outside to close.

const NAVY_700 = "#1B3A66";
const NAVY_800 = "#12294A";
const NAVY_900 = "#0B1A33";
const NAVY_950 = "#070E20";
const RED_500 = "#C8102E";
const RED_400 = "#E23A52";
const RED_900 = "#4A0914";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

const FONT_DISPLAY = "'Clash Display', 'Space Grotesk', system-ui, sans-serif";

type Props = {
  pickId: string;
  playerId: string;
  playerName: string;
  position: string | null;
  team: string | null;
};

export function ConfirmLockPickButton(props: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-sm px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] transition hover:brightness-110 md:min-h-0 md:px-3 md:py-1.5 md:text-[10px]"
        style={{
          backgroundColor: RED_500,
          color: CREAM_50,
          boxShadow: `0 0 0 1px ${RED_400}`,
        }}
      >
        ◉ Lock pick
      </button>

      {open ? (
        <ConfirmDialog
          titleId={titleId}
          onClose={() => setOpen(false)}
          {...props}
        />
      ) : null}
    </>
  );
}

function ConfirmDialog({
  titleId,
  onClose,
  pickId,
  playerId,
  playerName,
  position,
  team,
}: Props & { titleId: string; onClose: () => void }) {
  const meta = [position, team].filter(Boolean).join(" · ") || "Free agent";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10"
      style={{ backgroundColor: `${NAVY_950}E6`, backdropFilter: "blur(2px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FocusTrap
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md overflow-hidden rounded-sm border focus:outline-none"
        style={{
          borderColor: RED_500,
          backgroundColor: NAVY_900,
          boxShadow: `inset 0 0 0 1px ${RED_900}`,
        }}
        onClick={(e) => e.stopPropagation()}
        onEscape={onClose}
      >
        <header
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: NAVY_700 }}
        >
          <div className="flex flex-col gap-1">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.26em]"
              style={{ color: RED_400 }}
            >
              Confirm pick
            </p>
            <h2
              id={titleId}
              className="text-[20px] leading-tight tracking-[-0.005em]"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                color: CREAM_50,
                textTransform: "uppercase",
              }}
            >
              Lock {playerName}?
            </h2>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: CREAM_200 }}
            >
              {meta}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm transition-colors focus:outline-none"
            style={{ color: CREAM_400, backgroundColor: NAVY_800 }}
          >
            ✕
          </button>
        </header>

        <form action={lockPick} className="space-y-4 px-5 py-4">
          <input type="hidden" name="pickId" value={pickId} />
          <input type="hidden" name="playerId" value={playerId} />
          <p
            className="text-[13px] leading-[1.5]"
            style={{ color: CREAM_200 }}
          >
            This locks the pick. The Goodell box will announce {playerName} and
            the clock moves on. The pick can still be undone from the admin
            page — but undo demotes the next pick, so make sure you mean it.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition hover:brightness-110 focus:outline-none"
              style={{
                borderColor: NAVY_700,
                color: CREAM_200,
                backgroundColor: "transparent",
              }}
            >
              Cancel
            </button>
            <SubmitButton />
          </div>
        </form>
      </FocusTrap>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-sm px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition hover:brightness-110 disabled:opacity-60 focus:outline-none"
      style={{
        backgroundColor: RED_500,
        color: CREAM_50,
        boxShadow: `0 0 0 1px ${RED_400}`,
      }}
    >
      {pending ? "Locking…" : "◉ Confirm pick"}
    </button>
  );
}
