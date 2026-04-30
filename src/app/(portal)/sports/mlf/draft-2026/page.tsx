import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isDraft2026Enabled } from "@/lib/draft-flags";
import { formatCaption } from "@/lib/draft";
import { ClockCountdown } from "./ClockCountdown";
import { BigBoardControls } from "./BigBoardControls";
import { ChyronTicker } from "./ChyronTicker";
import { CommishDock } from "./CommishDock";
import { Dossier } from "./Dossier";
import { SnakeBoardWithReactions } from "./SnakeBoardWithReactions";

export const metadata = {
  title: "MLF Rookie Draft 2026",
};

// ---------------------------------------------------------------------------
// /sports/mlf/draft-2026 — the real draft room.
//
// Rendered states (server-derived):
//   * flag-off / no-draft / setup / complete → skeleton frame
//   * paused → live layout + paused banner
//   * live → full draft room (on-clock, big board, snake grid, Goodell)
//
// Server component; lockPick + admin actions trigger revalidatePath and
// redirect back here. The only client-side piece is ClockCountdown — a
// small countdown component that ticks locally so the "time remaining"
// feels alive without needing a polling round-trip.
// ---------------------------------------------------------------------------

const NAVY_950 = "#070E20";
const NAVY_900 = "#0B1A33";
const NAVY_800 = "#12294A";
const NAVY_700 = "#1B3A66";
const NAVY_600 = "#2A4F85";
const RED_500 = "#C8102E";
const RED_400 = "#E23A52";
const RED_900 = "#4A0914";
const CREAM_50 = "#F5F1E6";
const CREAM_100 = "#DFDBC9";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

const FONT_VARS: React.CSSProperties = {
  ["--font-display" as string]: "'Clash Display', 'Space Grotesk', system-ui, sans-serif",
  ["--font-ui" as string]: "'Satoshi', 'Manrope', system-ui, -apple-system, sans-serif",
};

// The page used to hardcode `slug: "mlf-2026"` for findUnique, but that
// forced the commissioner to use that exact string when creating the
// draft. Instead: prefer the live/paused draft, fall back to the most
// recently created. v1 only ever has one active rookie draft at a time
// — when we reuse this page for the 2027 season, just create the new
// draft and the old one quietly drops to "complete" (or gets deleted).
const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";

// Pick clock targets *tomorrow* at 11:00 America/Chicago so each manager
// sees "you have until 11am tomorrow CT" the moment they go on clock.
// To change the target time/day, edit the +1 day offset and the "11" hour
// below. DST-aware: CDT in April, CST in winter.
function nextElevenAmCentral(): Date {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const ct = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const part = (t: string) => Number(ct.find((p) => p.type === t)?.value ?? "0");
  const y = part("year");
  const m = part("month");
  const d = part("day");
  const pad = (n: number) => String(n).padStart(2, "0");
  const candidate = (offset: "-05:00" | "-06:00") =>
    new Date(`${y}-${pad(m)}-${pad(d)}T11:00:00${offset}`);
  // April → CDT (UTC-5); winter → CST (UTC-6). Probe by round-tripping a
  // candidate through Intl and matching the hour back to 11.
  const probe = candidate("-05:00");
  const probeHourCT = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).format(probe);
  const offset = probeHourCT === "11" ? "-05:00" : "-06:00";
  return candidate(offset);
}

// ---------------------------------------------------------------------------

export default async function DraftPage({
  searchParams,
}: {
  searchParams: { msg?: string; error?: string; selected?: string };
}) {
  const user = await getCurrentUser();
  const enabled = isDraft2026Enabled();

  const draftInclude = {
    slots: {
      include: {
        user: { select: { id: true, displayName: true, name: true } },
      },
    },
    sponsors: {
      where: { active: true },
      orderBy: [{ displayOrder: "asc" as const }],
    },
  };

  // Prefer a live/paused draft; fall back to the most-recent of any
  // status. Either way, we serve "the draft." No slug coupling.
  const draft = enabled
    ? (await prisma.draftRoom.findFirst({
        where: { status: { in: ["live", "paused"] } },
        orderBy: { openedAt: "desc" },
        include: draftInclude,
      })) ??
      (await prisma.draftRoom.findFirst({
        orderBy: { createdAt: "desc" },
        include: draftInclude,
      }))
    : null;

  if (!enabled) return <SkeletonFrame><NotYetOpen reason="flag" /></SkeletonFrame>;
  if (!draft) return <SkeletonFrame><NotYetOpen reason="no-draft" /></SkeletonFrame>;
  if (draft.status === "setup") return <SkeletonFrame><SetupInProgress name={draft.name} /></SkeletonFrame>;
  if (draft.status === "complete") return <SkeletonFrame><CompleteState name={draft.name} /></SkeletonFrame>;

  const [picks, pool, latestLocked] = await Promise.all([
    prisma.draftPick.findMany({
      where: { draftId: draft.id },
      orderBy: [{ overallPick: "asc" }],
      include: {
        player: {
          select: { playerId: true, fullName: true, position: true, team: true },
        },
        slot: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
        reaction: {
          select: { body: true, createdAt: true },
        },
      },
    }),
    prisma.draftPoolPlayer.findMany({
      where: { draftId: draft.id, removed: false },
      include: {
        player: {
          select: {
            playerId: true,
            fullName: true,
            position: true,
            team: true,
            projections: {
              where: { season: draft.season },
              select: { ptsPpr: true },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.draftPick.findFirst({
      where: { draftId: draft.id, status: "locked" },
      orderBy: [{ lockedAt: "desc" }],
      include: {
        player: {
          select: { fullName: true, position: true, team: true },
        },
        slot: {
          include: {
            user: { select: { displayName: true } },
          },
        },
        announcerImg: {
          select: { r2Key: true, label: true },
        },
      },
    }),
  ]);

  const onClock = picks.find((p) => p.status === "onClock") ?? null;
  const pickedPlayerIds = new Set(
    picks
      .filter((p) => p.status === "locked" && p.playerId)
      .map((p) => p.playerId as string),
  );
  const availablePool = pool
    .filter((r) => !pickedPlayerIds.has(r.playerId))
    .map((r) => ({
      id: r.id,
      playerId: r.playerId,
      player: {
        playerId: r.player.playerId,
        fullName: r.player.fullName,
        position: r.player.position,
        team: r.player.team,
        projection: r.player.projections[0]?.ptsPpr ?? null,
      },
    }));

  const onDeck = onClock
    ? picks
        .filter((p) => p.status === "pending" && p.overallPick > onClock.overallPick)
        .slice(0, 3)
    : [];

  const youreOnClock = !!onClock && !!user && onClock.userId === user.id;
  const isAdmin = user?.role === "ADMIN";
  const picksLocked = picks.filter((p) => p.status === "locked").length;
  const total = draft.totalRounds * draft.totalSlots;
  const selectedPlayerId = searchParams.selected?.trim() || null;

  return (
    <div
      className="min-h-screen"
      style={{
        ...FONT_VARS,
        backgroundColor: NAVY_950,
        color: CREAM_50,
        fontFamily: "var(--font-ui)",
      }}
    >
      <TurfAmbient />
      <ShieldWatermark />
      <main className="relative mx-auto max-w-[1440px]">
        {draft.status === "paused" && <PausedBanner />}
        {searchParams.error && <FlashRow kind="error" value={searchParams.error} />}
        {searchParams.msg === "locked" && <FlashRow kind="ok" value="Pick locked. Nice." />}

        <Hero
          onClock={onClock}
          picksLocked={picksLocked}
          total={total}
        />

        <section className="grid grid-cols-1 gap-4 px-4 pb-7 pt-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:gap-5 md:px-8">
          <OnClockPanel
            onClock={onClock}
            onDeck={onDeck}
            pickClockSec={draft.pickClockSec}
          />
          <GoodellBox compact latestLocked={latestLocked} />
        </section>

        <section
          className={
            selectedPlayerId
              ? "mx-4 mb-8 grid gap-4 md:mx-8 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:gap-5"
              : "mx-4 mb-8 md:mx-8"
          }
        >
          <BigBoardControls
            pool={availablePool}
            youreOnClock={youreOnClock}
            isAdmin={!!isAdmin}
            onClockPickId={onClock?.id ?? null}
            selectedPlayerId={selectedPlayerId}
          />
          {selectedPlayerId && <Dossier playerId={selectedPlayerId} />}
        </section>

        <SnakeBoardWithReactions
          picks={picks}
          totalSlots={draft.totalSlots}
        />

        <ChyronTicker
          sponsors={draft.sponsors.map((s) => ({
            name: s.name,
            tagline: s.tagline,
            // Resolve R2 key to public URL on the server so the client
            // component doesn't need NEXT_PUBLIC_R2_PUBLIC_BASE_URL.
            // Empty R2_BASE → null (image mode disabled at deploy time).
            imageUrl:
              s.imageR2Key && R2_BASE
                ? `${R2_BASE.replace(/\/+$/, "")}/${s.imageR2Key}`
                : null,
            linkUrl: s.linkUrl,
          }))}
        />

        <Footer season={draft.season} />
      </main>
      {isAdmin && (
        <CommishDock
          draftId={draft.id}
          status={draft.status as "live" | "paused"}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambient layers — mirrors the mockup. Reading-imperceptible, felt.
// ---------------------------------------------------------------------------

function TurfAmbient() {
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 h-full w-full opacity-[0.055]">
      <defs>
        <filter id="turf-noise-live" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="7" />
          <feColorMatrix
            values="0 0 0 0 0.18
                    0 0 0 0 0.36
                    0 0 0 0 0.23
                    0 0 0 0.85 0"
          />
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <radialGradient id="vignette-live" cx="50%" cy="45%" r="75%">
          <stop offset="60%" stopColor="#2E5A3A" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" filter="url(#turf-noise-live)" />
      <rect width="100%" height="100%" fill="url(#vignette-live)" />
    </svg>
  );
}

function ShieldWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed -bottom-24 -right-16 h-[520px] w-[520px] opacity-[0.045]"
      style={{ filter: "blur(0.5px)" }}
    >
      <MLFShield />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MLF shield — real asset at /public/mlf_logo.png (1024×1024). Call sites
// pass classNames like "h-[160px] w-auto"; next/image respects that.
// ---------------------------------------------------------------------------

function MLFShield({ className = "h-full w-full" }: { className?: string }) {
  return (
    <Image
      src="/mlf_logo.png"
      alt="MLF shield"
      width={1024}
      height={1024}
      className={className}
      priority={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({
  onClock,
  picksLocked,
  total,
}: {
  onClock: { overallPick: number; round: number } | null;
  picksLocked: number;
  total: number;
}) {
  return (
    <section className="relative px-4 pb-6 pt-6 md:px-8 md:pt-10">
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-8">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="absolute -inset-4 -z-10 rounded-full blur-2xl"
            style={{ background: `radial-gradient(closest-side, ${RED_900}80 0%, transparent 70%)` }}
          />
          <MLFShield className="h-[88px] w-auto drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)] md:h-[160px]" />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: CREAM_200 }}>
              Live draft · 2026 Rookie class
            </span>
            <OnAirBadge />
            <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: CREAM_400 }}>
              {String(picksLocked).padStart(2, "0")} of {String(total).padStart(2, "0")} picks complete
            </span>
          </div>
          <h1
            className="text-[44px] leading-[0.86] tracking-[-0.015em] md:text-[108px]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              color: CREAM_50,
              textTransform: "uppercase",
            }}
          >
            {onClock ? (
              <>
                Pick {String(onClock.overallPick).padStart(2, "0")}{" "}
                <span style={{ color: RED_500, fontWeight: 900 }}>/</span>{" "}
                <span style={{ color: CREAM_200 }}>Round {onClock.round}</span>
              </>
            ) : (
              <span style={{ color: CREAM_200 }}>Ready to begin</span>
            )}
          </h1>
        </div>
      </div>
    </section>
  );
}

function OnAirBadge() {
  // Flourish: breathing-light pulse (2.4s full cycle). Respects reduced-motion.
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em]"
      style={{ backgroundColor: RED_900, color: RED_400 }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full motion-reduce:animate-none"
        style={{
          backgroundColor: RED_500,
          animation: "lr-onair-breath 2.4s ease-in-out infinite",
        }}
      />
      On air
      <style>{`@keyframes lr-onair-breath { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.55;transform:scale(0.88);} }`}</style>
    </span>
  );
}

function PausedBanner() {
  return (
    <div
      className="mx-8 mt-6 rounded-sm border px-4 py-2 text-sm"
      style={{ borderColor: "#B86F22", backgroundColor: "#3A2410", color: "#EABF7A" }}
    >
      Draft is paused by the commissioner. Picks frozen until resume.
    </div>
  );
}

function FlashRow({ kind, value }: { kind: "ok" | "error"; value: string }) {
  return (
    <div
      className="mx-8 mt-6 rounded-sm border px-4 py-2 text-sm"
      style={
        kind === "error"
          ? { borderColor: "#8F3A3A", backgroundColor: "#3B1414", color: "#F2B4B4" }
          : { borderColor: "#3A6F55", backgroundColor: "#10311F", color: "#9BE6BB" }
      }
    >
      {value}
    </div>
  );
}

// ---------------------------------------------------------------------------
// On-clock panel
// ---------------------------------------------------------------------------

type PickDetail = {
  id: string;
  overallPick: number;
  round: number;
  pickInRound: number;
  slotId: string;
  status: string;
  userId: string;
  onClockAt: Date | null;
  lockedAt: Date | null;
  player: { playerId: string; fullName: string | null; position: string | null; team: string | null } | null;
  reaction: { body: string; createdAt: Date } | null;
  slot: {
    slotOrder: number;
    teamName: string | null;
    user: { id: string; displayName: string };
  };
};

function OnClockPanel({
  onClock,
  onDeck,
  pickClockSec,
}: {
  onClock: PickDetail | null;
  onDeck: PickDetail[];
  pickClockSec: number;
}) {
  return (
    <div
      className="relative flex flex-wrap items-start gap-x-6 gap-y-4 overflow-hidden rounded-sm border p-5 md:flex-nowrap md:items-center md:gap-8 md:p-6"
      style={{
        borderColor: RED_500,
        backgroundColor: `${NAVY_900}CC`,
        boxShadow: `inset 0 0 0 1px ${RED_900}`,
      }}
    >
      <span aria-hidden className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: RED_500 }} />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: RED_400 }}>
          On the clock
        </span>
        <div
          className="text-[26px] leading-[0.9] tracking-[-0.01em] md:text-[34px]"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            color: CREAM_50,
            textTransform: "uppercase",
          }}
        >
          {onClock?.slot.user.displayName ?? "—"}
        </div>
        {onClock?.slot.teamName && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: CREAM_200 }}>
            {onClock.slot.teamName}
          </div>
        )}
      </div>

      <div className="hidden h-16 w-px md:block" style={{ backgroundColor: NAVY_600 }} />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: CREAM_400 }}>
          Time remaining
        </span>
        {onClock?.onClockAt ? (
          <ClockCountdown
            onClockAt={onClock.onClockAt.toISOString()}
            pickClockSec={pickClockSec}
            deadlineAt={nextElevenAmCentral().toISOString()}
            activeColor={RED_400}
            expiredColor={CREAM_400}
          />
        ) : (
          <span
            className="text-[28px] md:text-[36px]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: CREAM_400 }}
          >
            —
          </span>
        )}
      </div>

      <div className="hidden h-16 w-px md:block" style={{ backgroundColor: NAVY_600 }} />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: CREAM_400 }}>
          On deck
        </span>
        <div className="text-[13px] font-semibold" style={{ color: CREAM_200 }}>
          {onDeck.length === 0 ? (
            <span style={{ color: CREAM_400 }}>—</span>
          ) : (
            onDeck.map((p, idx) => (
              <span key={p.id}>
                {idx > 0 && <span style={{ color: CREAM_400 }}> → </span>}
                {p.slot.user.displayName}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Big Board interior moved to ./BigBoardControls.tsx (client; search +
// position filter + sort, optional ?selected= companion to <Dossier />).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Draft Board (snake grid)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Snake-grid Draft Board moved to ./SnakeBoardWithReactions.tsx (client;
// owns the click-to-expand reaction popovers + sr-only fallback list).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Goodell box — most recent locked pick with consumed announcer image
// ---------------------------------------------------------------------------

function GoodellBox({
  latestLocked,
  compact = false,
}: {
  latestLocked:
    | {
        overallPick: number;
        player: { fullName: string | null; team: string | null } | null;
        slot: {
          teamName: string | null;
          user: { displayName: string };
        };
        announcerImg: { r2Key: string; label: string | null } | null;
        lockedAt: Date | null;
      }
    | null;
  /** Compact mode: image stays prominent (rotating announcer photos are
   *  the personality slot), caption demotes to Satoshi italic so the live
   *  on-clock timer wins the row hierarchy. Used in the top-right slot. */
  compact?: boolean;
}) {
  if (!latestLocked || !latestLocked.player?.fullName) {
    return (
      <div
        className="flex items-center justify-center rounded-sm border p-8 text-sm italic"
        style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC`, color: CREAM_400 }}
      >
        Podium&rsquo;s empty. First pick lands here.
      </div>
    );
  }

  const caption = formatCaption({
    overallPick: latestLocked.overallPick,
    slotTeamName: latestLocked.slot.teamName,
    slotManagerDisplay: latestLocked.slot.user.displayName,
    playerFullName: latestLocked.player.fullName,
    playerNflTeam: latestLocked.player.team,
  });

  const imageUrl =
    latestLocked.announcerImg && R2_BASE
      ? `${R2_BASE.replace(/\/+$/, "")}/${latestLocked.announcerImg.r2Key}`
      : null;

  // Compact: tighter image, demoted caption. Sits beside the on-clock
  // panel so the live timer is the loudest thing on that row.
  const imageWrapClass = compact
    ? "relative flex h-[140px] w-full shrink-0 items-center justify-center overflow-hidden border-b md:h-[140px] md:w-[140px] md:border-b-0 md:border-r"
    : "relative flex h-[160px] w-full shrink-0 items-center justify-center overflow-hidden border-b md:h-[220px] md:w-[260px] md:border-b-0 md:border-r";
  const captionClass = compact
    ? "leading-[1.4]"
    : "text-[18px] leading-[1.2] tracking-[-0.005em] md:text-[26px]";
  const captionStyle: React.CSSProperties = compact
    ? {
        fontFamily: "var(--font-ui)",
        fontStyle: "italic",
        fontWeight: 500,
        fontSize: 17,
        color: CREAM_50,
      }
    : {
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        color: CREAM_50,
        textTransform: "uppercase",
      };

  return (
    <div
      className="flex flex-col overflow-hidden rounded-sm border md:flex-row"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div
        className={imageWrapClass}
        style={{
          borderColor: NAVY_700,
          background: `linear-gradient(180deg, ${NAVY_700} 0%, ${NAVY_950} 100%)`,
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={latestLocked.announcerImg?.label ?? "Announcer image"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <MLFShield className={compact ? "h-14 w-auto opacity-80" : "h-20 w-auto opacity-80"} />
            <span
              className="text-[9px] font-bold uppercase tracking-[0.2em]"
              style={{ color: CREAM_400 }}
            >
              League seal
            </span>
          </div>
        )}
      </div>

      <div className={
        compact
          ? "flex flex-1 flex-col justify-center gap-2 px-4 py-4"
          : "flex flex-1 flex-col justify-center gap-3 px-5 py-5 md:px-7 md:py-6"
      }>
        <div className="flex items-center gap-2">
          {!compact && <MLFShield className="h-6 w-auto" />}
          <span
            className="text-[9px] font-bold uppercase tracking-[0.26em]"
            style={{ color: RED_400 }}
          >
            At the podium · Pick {String(latestLocked.overallPick).padStart(2, "0")}
          </span>
        </div>
        <p className={captionClass} style={captionStyle}>
          &ldquo;{caption}&rdquo;
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pick reactions moved to per-cell click-to-expand popovers in
// SnakeBoardWithReactions.tsx (with an sr-only fallback list rendered
// inside the same component for screen-reader skim).
// ---------------------------------------------------------------------------

function Footer({ season }: { season: string }) {
  return (
    <footer
      className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-5 text-[10px] font-bold uppercase tracking-[0.26em] md:px-8 md:py-6"
      style={{ borderColor: NAVY_800, color: CREAM_400 }}
    >
      <span>
        MLF Draft {season} <span style={{ color: CREAM_200 }}>·</span> Live
      </span>
      <span>
        Lazy River Co. <span style={{ color: CREAM_200 }}>·</span> {new Date().getFullYear()}
      </span>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Skeleton frame for non-live states
// ---------------------------------------------------------------------------

function SkeletonFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ ...FONT_VARS, backgroundColor: NAVY_950, color: CREAM_50, fontFamily: "var(--font-ui)" }}
    >
      <TurfAmbient />
      <ShieldWatermark />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8 md:px-8 md:py-12">
        <Link
          href="/"
          className="text-[11px] font-semibold uppercase tracking-[0.22em] transition hover:opacity-80"
          style={{ color: CREAM_200 }}
        >
          ← Back to Lazy River
        </Link>
        <div className="my-auto">
          <header className="space-y-3 text-center">
            <div className="flex justify-center">
              <MLFShield className="h-[88px] w-auto md:h-[120px]" />
            </div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.26em]"
              style={{ color: CREAM_400 }}
            >
              Mens League of Football
            </p>
            <h1
              className="text-[36px] leading-[0.9] tracking-[-0.015em] md:text-[56px]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                color: CREAM_50,
                textTransform: "uppercase",
              }}
            >
              Rookie Draft <span style={{ color: RED_500 }}>/</span> 2026
            </h1>
          </header>
          <section
            className="mt-8 rounded-sm border p-6 md:mt-10 md:p-8"
            style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
          >
            {children}
          </section>
          <p
            className="mt-6 text-center text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: CREAM_400 }}
          >
            <Link href="/mockup/draft-2026" style={{ color: RED_400 }}>
              See the design mockup →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function NotYetOpen({ reason }: { reason: "flag" | "no-draft" }) {
  return (
    <div className="space-y-3 text-center">
      <p
        className="text-[18px] font-semibold uppercase tracking-[0.02em]"
        style={{ fontFamily: "var(--font-display)", color: CREAM_100 }}
      >
        Draft not yet open.
      </p>
      <p className="text-sm" style={{ color: CREAM_200 }}>
        {reason === "flag"
          ? "The draft is still being staged behind the scenes. Check back after the NFL Draft wraps."
          : "The 2026 draft room hasn't been set up yet. Check back soon."}
      </p>
    </div>
  );
}

function SetupInProgress({ name }: { name: string }) {
  return (
    <div className="space-y-3 text-center">
      <p
        className="text-[18px] font-semibold uppercase tracking-[0.02em]"
        style={{ fontFamily: "var(--font-display)", color: CREAM_50 }}
      >
        {name}
      </p>
      <p className="text-sm" style={{ color: CREAM_200 }}>
        The commissioner is wiring up slots, the rookie pool, and the
        Goodell image stack. It&rsquo;ll open once setup is done.
      </p>
    </div>
  );
}

function CompleteState({ name }: { name: string }) {
  return (
    <div className="space-y-3 text-center">
      <p
        className="text-[18px] font-semibold uppercase tracking-[0.02em]"
        style={{ fontFamily: "var(--font-display)", color: CREAM_50 }}
      >
        {name}
      </p>
      <p className="text-sm" style={{ color: CREAM_200 }}>
        Draft complete. Final results archive coming in Phase 4.
      </p>
    </div>
  );
}
