import Image from "next/image";
import Link from "next/link";
import { isDraft2026Enabled } from "@/lib/draft-flags";

// MLF Draft entry-point for the /sports right rail. Visually a portal into
// the broadcast aesthetic at /sports/mlf/draft-2026 — same navy + red + cream
// + Clash Display, just compressed to fit a 5/12 column. Hidden when the
// DRAFT_2026_ENABLED flag is off (matches the pattern documented in
// src/lib/draft-flags.ts).

// keep in sync with /sports/mlf/draft-2026/page.tsx
const NAVY_950 = "#070E20";
const RED_500 = "#C8102E";
const RED_900 = "#4A0914";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";

const DISPLAY_STACK = "'Clash Display', 'Space Grotesk', system-ui, sans-serif";

export function MlfDraftBanner() {
  if (!isDraft2026Enabled()) return null;

  return (
    <Link
      href="/sports/mlf/draft-2026"
      aria-label="MLF Rookie Draft 2026 — open draft room"
      className="group relative block overflow-hidden rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-50"
      style={{ backgroundColor: NAVY_950 }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ backgroundColor: RED_500 }}
      />

      <div className="flex flex-row items-center gap-4 px-4 py-4 md:gap-5 md:px-5 md:py-5">
        <div className="relative shrink-0">
          <span
            aria-hidden
            className="absolute -inset-2 -z-10 rounded-full blur-xl"
            style={{
              background: `radial-gradient(closest-side, ${RED_900}80 0%, transparent 70%)`,
            }}
          />
          <Image
            src="/mlf_logo.png"
            alt=""
            width={1024}
            height={1024}
            sizes="56px"
            className="h-12 w-12 drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)] md:h-14 md:w-14"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.26em]"
            style={{ color: CREAM_200, fontFamily: DISPLAY_STACK }}
          >
            Rookie Class
          </span>
          <h2
            className="text-balance text-[20px] leading-[0.92] tracking-[-0.01em] md:text-[22px]"
            style={{
              fontFamily: DISPLAY_STACK,
              fontWeight: 800,
              color: CREAM_50,
              textTransform: "uppercase",
            }}
          >
            MLF Rookie Draft{" "}
            <span style={{ color: RED_500, fontWeight: 900 }}>/</span>{" "}
            <span style={{ color: CREAM_200 }}>2026</span>
          </h2>
        </div>

        <span
          aria-hidden
          className="shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          style={{ color: CREAM_200 }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="square"
            strokeLinejoin="miter"
          >
            <path d="M3 7h8" />
            <path d="M7.5 3.5L11 7l-3.5 3.5" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
