import { LiveDot } from "./LiveDot";
import { SponsorPresenter } from "./SponsorPresenter";
import type { SportsSponsor } from "@prisma/client";

/// Section header for /sports. Renders today's date in tabular-nums, a
/// "Today" wordmark, and a LIVE indicator if any game is currently live.
/// Branding lives in MlsnHeaderBar (the red top bar); this hero is now
/// the section-level introduction below it.
export function SportsHero({
  liveCount,
  totalGames,
  totalHeadlines,
  sponsor,
}: {
  /// Number of `SportsScheduleGame` rows where status === "LIVE".
  liveCount: number;
  totalGames: number;
  totalHeadlines: number;
  /// Active sponsor for today's rotation, or null when no sponsors are
  /// configured. Renders as "Presented By [name]" in the meta strip.
  sponsor: Pick<SportsSponsor, "name"> | null;
}) {
  const today = new Date();
  // Format as "Mon · 27 Apr 2026" using en-US locale; tabular-nums in
  // the className handles digit alignment.
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <section
      aria-labelledby="sports-hero-heading"
      className="relative flex w-full flex-col justify-end overflow-hidden md:min-h-[70vh]"
      style={{ minHeight: "38vh" }}
    >
      {/* Layered ambient field — deepest bone with claude + amber radials */}
      <div aria-hidden="true" className="absolute inset-0 bg-bone-950" />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.35]"
        style={{
          background: `
            radial-gradient(60% 80% at 18% 110%, rgba(217,87,163,0.18) 0%, transparent 60%),
            radial-gradient(50% 70% at 85% 30%, rgba(242,201,76,0.10) 0%, transparent 65%),
            radial-gradient(40% 60% at 50% 0%, rgba(217,87,163,0.06) 0%, transparent 70%)
          `,
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #6E6B64 1px, transparent 1px), linear-gradient(to bottom, #6E6B64 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Top meta strip — pt-16 on mobile clears the SidebarShell's
          floating-button (fixed top-2 + safe-area-inset-top, ~56px tall
          on iOS). Desktop uses pt-10 since the sidebar is sticky-left,
          not floating-over. */}
      <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 pt-16 md:px-6 md:pt-10 lg:px-10">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-300">
          Lazy River · Sports Desk
        </span>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <SponsorPresenter sponsor={sponsor} />
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] tabular-nums text-bone-400">
            {dateStr}
          </span>
        </div>
      </div>

      {/* Wordmark + meta footer line */}
      <div className="relative mx-auto mt-auto w-full max-w-7xl px-4 pb-6 md:px-6 md:pb-10 lg:px-10">
        <h1
          id="sports-hero-heading"
          className="text-center font-nippo font-bold tracking-tight text-bone-50"
          style={{
            fontSize: "clamp(48px, 10vw, 120px)",
            lineHeight: 0.85,
            letterSpacing: "-0.04em",
          }}
        >
          Today
        </h1>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-bone-800/80 pt-3 md:mt-6 md:gap-6 md:pt-5">
          <div className="flex items-center gap-2">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
              Today
            </span>
            <span className="text-sm tabular-nums text-bone-100 md:text-base">
              {totalGames} {totalGames === 1 ? "game" : "games"}
              {liveCount > 0 ? ` · ${liveCount} live` : ""}
              {totalHeadlines > 0 ? ` · ${totalHeadlines} headlines` : ""}
            </span>
          </div>
          {liveCount > 0 ? (
            <div className="flex items-center gap-2">
              <LiveDot className="h-2 w-2" />
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-sports-amber">
                Live
              </span>
              <span className="text-sm text-bone-200">
                {liveCount === 1 ? "game in progress" : "games in progress"}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
