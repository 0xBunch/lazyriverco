"use client";

import { useEffect, useState } from "react";

// Live countdown rendered as HH : MM : SS with the colons gently
// breathing (opacity 0.35 → 1 over 1s) — a quiet scoreboard detail.
// Respects prefers-reduced-motion; the colons go solid.

type Props = {
  /** ISO timestamp string of when the current pick went on the clock. */
  onClockAt: string;
  /** Pick-clock duration in seconds (draft-wide config). */
  pickClockSec: number;
  /** Display color when time remains. */
  activeColor?: string;
  /** Display color when the clock has crossed zero. */
  expiredColor?: string;
};

export function ClockCountdown({
  onClockAt,
  pickClockSec,
  activeColor = "#E23A52",
  expiredColor = "#8A8372",
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(onClockAt).getTime();
  const deadline = start + pickClockSec * 1000;
  const remainingMs = Math.max(0, deadline - now);
  const expired = remainingMs === 0;

  const totalSeconds = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const color = expired ? expiredColor : activeColor;

  return (
    <span
      className="inline-flex items-baseline leading-none tracking-[-0.01em] tabular-nums"
      style={{
        fontFamily: "var(--font-display, 'Clash Display', system-ui)",
        fontWeight: 700,
        fontSize: 36,
        color,
      }}
    >
      <span>{pad(h)}</span>
      <BlinkingColon />
      <span>{pad(m)}</span>
      <BlinkingColon />
      <span>{pad(s)}</span>
      <style jsx>{`
        @keyframes lr-clock-colon {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </span>
  );
}

function BlinkingColon() {
  return (
    <span
      aria-hidden
      className="mx-[0.15em] motion-reduce:animate-none"
      style={{
        animation: "lr-clock-colon 1s ease-in-out infinite",
      }}
    >
      :
    </span>
  );
}
