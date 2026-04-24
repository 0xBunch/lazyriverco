import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isDraft2026Enabled } from "@/lib/draft-flags";
import { formatCaption } from "@/lib/draft";
import { lockPick } from "./actions";
import { ClockCountdown } from "./ClockCountdown";

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

const DRAFT_SLUG = "mlf-2026";
const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "";

// ---------------------------------------------------------------------------

export default async function DraftPage({
  searchParams,
}: {
  searchParams: { msg?: string; error?: string };
}) {
  const user = await getCurrentUser();
  const enabled = isDraft2026Enabled();

  const draft = enabled
    ? await prisma.draftRoom.findUnique({
        where: { slug: DRAFT_SLUG },
        include: {
          slots: {
            include: {
              user: { select: { id: true, displayName: true, name: true } },
            },
          },
          sponsors: {
            where: { active: true },
            orderBy: [{ displayOrder: "asc" }],
          },
        },
      })
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
  const availablePool = pool.filter((r) => !pickedPlayerIds.has(r.playerId));

  const onDeck = onClock
    ? picks
        .filter((p) => p.status === "pending" && p.overallPick > onClock.overallPick)
        .slice(0, 3)
    : [];

  const youreOnClock = !!onClock && !!user && onClock.userId === user.id;
  const isAdmin = user?.role === "ADMIN";
  const sponsor = draft.sponsors[0] ?? null;
  const picksLocked = picks.filter((p) => p.status === "locked").length;
  const total = draft.totalRounds * draft.totalSlots;

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
        <TopBar
          seasonLabel={`${draft.season} · Rookie`}
          user={user}
        />
        {draft.status === "paused" && <PausedBanner />}
        {searchParams.error && <FlashRow kind="error" value={searchParams.error} />}
        {searchParams.msg === "locked" && <FlashRow kind="ok" value="Pick locked. Nice." />}

        <Hero
          onClock={onClock}
          picksLocked={picksLocked}
          total={total}
        />

        <section className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 px-8 pb-7 pt-2">
          <OnClockPanel
            onClock={onClock}
            onDeck={onDeck}
            pickClockSec={draft.pickClockSec}
          />
          <SponsorRail
            sponsor={sponsor}
            totalSponsors={draft.sponsors.length}
          />
        </section>

        <BigBoard
          pool={availablePool}
          youreOnClock={youreOnClock}
          isAdmin={!!isAdmin}
          onClockPickId={onClock?.id ?? null}
        />

        <DraftBoard
          picks={picks}
          totalSlots={draft.totalSlots}
        />

        <section className="px-8 pb-8">
          <GoodellBox latestLocked={latestLocked} />
        </section>

        <ReactionsFeed picks={picks} />

        <Footer season={draft.season} />
      </main>
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
// Chrome + hero
// ---------------------------------------------------------------------------

function TopBar({
  seasonLabel,
  user,
}: {
  seasonLabel: string;
  user: { displayName: string; role: string } | null;
}) {
  return (
    <header
      className="flex items-center justify-between border-b px-6 py-3"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}E6` }}
    >
      <Link
        href="/"
        className="group flex items-center gap-3 text-[11px] font-semibold tracking-[0.16em] transition"
        style={{ color: CREAM_200 }}
      >
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm border transition group-hover:scale-105"
          style={{ borderColor: NAVY_600, color: CREAM_400 }}
        >
          ←
        </span>
        <span className="uppercase" style={{ color: CREAM_200 }}>
          Back to Lazy River
        </span>
      </Link>

      <div
        className="flex items-baseline gap-3 text-[11px] font-bold uppercase tracking-[0.24em]"
        style={{ color: CREAM_400 }}
      >
        <span style={{ color: CREAM_200 }}>The Official</span>
        <span style={{ color: CREAM_50 }}>Mens League of Football Draft</span>
        <span style={{ color: "#385480" }}>·</span>
        <span>{seasonLabel}</span>
      </div>

      {user ? (
        <div
          className="flex items-center gap-2 rounded-sm px-2.5 py-1.5"
          style={{ backgroundColor: NAVY_800 }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: user.role === "ADMIN" ? RED_500 : "#3D689E" }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: CREAM_50 }}
          >
            {user.displayName}
            {user.role === "ADMIN" ? " · Commissioner" : ""}
          </span>
        </div>
      ) : (
        <span />
      )}
    </header>
  );
}

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
    <section className="relative px-8 pb-6 pt-10">
      <div className="flex items-center gap-8">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="absolute -inset-4 -z-10 rounded-full blur-2xl"
            style={{ background: `radial-gradient(closest-side, ${RED_900}80 0%, transparent 70%)` }}
          />
          <MLFShield className="h-[160px] w-auto drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]" />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: CREAM_200 }}>
              Live draft · 2026 Rookie class
            </span>
            <OnAirBadge />
            <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: CREAM_400 }}>
              {String(picksLocked).padStart(2, "0")} of {String(total).padStart(2, "0")} picks complete
            </span>
          </div>
          <h1
            className="leading-[0.86] tracking-[-0.015em]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 108,
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
      className="relative flex items-center gap-8 overflow-hidden rounded-sm border p-6"
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
          className="leading-[0.9] tracking-[-0.01em]"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 34,
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

      <div className="h-16 w-px" style={{ backgroundColor: NAVY_600 }} />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: CREAM_400 }}>
          Time remaining
        </span>
        {onClock?.onClockAt ? (
          <ClockCountdown
            onClockAt={onClock.onClockAt.toISOString()}
            pickClockSec={pickClockSec}
            activeColor={RED_400}
            expiredColor={CREAM_400}
          />
        ) : (
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 36, color: CREAM_400 }}>
            —
          </span>
        )}
      </div>

      <div className="h-16 w-px" style={{ backgroundColor: NAVY_600 }} />

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

function SponsorRail({
  sponsor,
  totalSponsors,
}: {
  sponsor: { name: string; tagline: string | null } | null;
  totalSponsors: number;
}) {
  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-sm border p-5"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em]">
          <span style={{ color: CREAM_400 }}>Sponsor</span>
          <span style={{ color: NAVY_600 }}>·</span>
          <span style={{ color: CREAM_200 }}>Rotation</span>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.18em] tabular-nums"
          style={{ color: CREAM_400 }}
        >
          {totalSponsors > 0 ? `01 / ${String(totalSponsors).padStart(2, "0")}` : "—"}
        </span>
      </div>

      {sponsor ? (
        <>
          <div
            className="leading-[1] tracking-[-0.01em]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 24,
              color: CREAM_50,
              textTransform: "uppercase",
            }}
          >
            {sponsor.name}
          </div>
          {sponsor.tagline && (
            <div className="text-[13px] italic leading-[1.35]" style={{ color: CREAM_200 }}>
              &ldquo;{sponsor.tagline}&rdquo;
            </div>
          )}
        </>
      ) : (
        <div className="text-[13px] italic" style={{ color: CREAM_400 }}>
          No sponsors on rotation yet. Add some in admin.
        </div>
      )}

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        {Array.from({ length: Math.max(totalSponsors, 1) }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: i === 0 ? RED_500 : NAVY_600 }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Big Board
// ---------------------------------------------------------------------------

function BigBoard({
  pool,
  youreOnClock,
  isAdmin,
  onClockPickId,
}: {
  pool: Array<{
    id: string;
    playerId: string;
    player: {
      playerId: string;
      fullName: string | null;
      position: string | null;
      team: string | null;
    };
  }>;
  youreOnClock: boolean;
  isAdmin: boolean;
  onClockPickId: string | null;
}) {
  return (
    <section
      className="mx-8 mb-8 overflow-hidden rounded-sm border"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div className="flex items-center gap-5 border-b px-4 py-3" style={{ borderColor: NAVY_700 }}>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: CREAM_200 }}>
          Big Board
        </h2>
        <span className="h-3.5 w-px" style={{ backgroundColor: NAVY_600 }} />
        <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: CREAM_400 }}>
          {pool.length} available
        </span>
        <div className="flex-1" />
        {youreOnClock && (
          <span
            className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ backgroundColor: RED_900, color: RED_400 }}
          >
            Your pick
          </span>
        )}
        {isAdmin && !youreOnClock && onClockPickId && (
          <span
            className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ backgroundColor: NAVY_800, color: CREAM_200 }}
          >
            Admin · pick on-behalf
          </span>
        )}
      </div>
      {pool.length === 0 ? (
        <p className="px-4 py-6 italic text-sm" style={{ color: CREAM_400 }}>
          Pool is empty. Seed it from the admin.
        </p>
      ) : (
        <div>
          {pool.map((row, idx) => (
            <PoolRow
              key={row.id}
              rank={idx + 1}
              player={row.player}
              youCanPick={(youreOnClock || isAdmin) && !!onClockPickId}
              onClockPickId={onClockPickId}
              alt={idx % 2 !== 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PoolRow({
  rank,
  player,
  youCanPick,
  onClockPickId,
  alt,
}: {
  rank: number;
  player: {
    playerId: string;
    fullName: string | null;
    position: string | null;
    team: string | null;
  };
  youCanPick: boolean;
  onClockPickId: string | null;
  alt: boolean;
}) {
  const name = player.fullName ?? player.playerId;
  return (
    <div
      className="grid grid-cols-[40px_minmax(0,2fr)_50px_50px_140px] items-center gap-3 border-b px-4 py-2.5 text-[13px] tabular-nums transition duration-150 hover:translate-x-px"
      style={{
        borderColor: `${NAVY_700}40`,
        backgroundColor: alt ? `${NAVY_800}55` : "transparent",
      }}
    >
      <span style={{ color: CREAM_400 }}>{String(rank).padStart(2, "0")}</span>
      <span className="truncate font-semibold" style={{ color: CREAM_50 }}>
        {name}
      </span>
      <span className="font-semibold" style={{ color: CREAM_200 }}>
        {player.position ?? "?"}
      </span>
      <span className="font-semibold" style={{ color: CREAM_200 }}>
        {player.team ?? "FA"}
      </span>
      <div className="flex items-center justify-end">
        {youCanPick && onClockPickId ? (
          <form action={lockPick} className="contents">
            <input type="hidden" name="pickId" value={onClockPickId} />
            <input type="hidden" name="playerId" value={player.playerId} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition hover:brightness-110"
              style={{
                backgroundColor: RED_500,
                color: CREAM_50,
                boxShadow: `0 0 0 1px ${RED_400}`,
              }}
            >
              ◉ Lock pick
            </button>
          </form>
        ) : (
          <span style={{ color: CREAM_400, fontSize: 11 }}>→</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft Board (snake grid)
// ---------------------------------------------------------------------------

function DraftBoard({
  picks,
  totalSlots,
}: {
  picks: PickDetail[];
  totalSlots: number;
}) {
  if (picks.length === 0) return null;

  const byRound = new Map<number, PickDetail[]>();
  for (const p of picks) {
    const list = byRound.get(p.round) ?? [];
    list.push(p);
    byRound.set(p.round, list);
  }

  return (
    <section className="px-8 pb-8">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: CREAM_200 }}>
          Draft Board
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: CREAM_400 }}>
          · Snake · 3 rounds × {totalSlots} managers
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {[...byRound.entries()]
          .sort(([a], [b]) => a - b)
          .map(([round, rp]) => (
            <div
              key={round}
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${rp.length}, minmax(0, 1fr))` }}
            >
              {rp
                .sort((a, b) => a.pickInRound - b.pickInRound)
                .map((p) => (
                  <SnakeCell key={p.id} pick={p} />
                ))}
            </div>
          ))}
      </div>
    </section>
  );
}

function SnakeCell({ pick }: { pick: PickDetail }) {
  const isCurrent = pick.status === "onClock";
  const isTaken = pick.status === "locked";
  const bg = isCurrent ? `${RED_900}99` : isTaken ? NAVY_800 : `${NAVY_900}80`;
  const border = isCurrent ? RED_500 : NAVY_700;

  return (
    <div
      className="flex min-h-[64px] flex-col gap-1 rounded-sm border px-3 py-2.5"
      style={{
        backgroundColor: bg,
        borderColor: border,
        boxShadow: isCurrent ? `0 0 0 1px ${RED_900}` : undefined,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 12,
            color: isCurrent ? RED_400 : CREAM_400,
            letterSpacing: "0.04em",
          }}
        >
          {pick.round}.{String(pick.pickInRound).padStart(2, "0")}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: isCurrent ? RED_400 : CREAM_200 }}
        >
          {pick.slot.user.displayName}
        </span>
      </div>
      {isCurrent ? (
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: RED_400 }}>
          ◉ On the clock
        </span>
      ) : isTaken && pick.player?.fullName ? (
        <span
          className="leading-tight"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: CREAM_50,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          {pick.player.fullName}
        </span>
      ) : (
        <span style={{ color: CREAM_400, fontSize: 12 }}>—</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goodell box — most recent locked pick with consumed announcer image
// ---------------------------------------------------------------------------

function GoodellBox({
  latestLocked,
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

  return (
    <div
      className="flex overflow-hidden rounded-sm border"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div
        className="relative flex h-[220px] w-[260px] shrink-0 items-center justify-center overflow-hidden border-r"
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
            <MLFShield className="h-20 w-auto opacity-80" />
            <span
              className="text-[9px] font-bold uppercase tracking-[0.2em]"
              style={{ color: CREAM_400 }}
            >
              League seal
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3 px-7 py-6">
        <div className="flex items-center gap-3">
          <MLFShield className="h-6 w-auto" />
          <span
            className="text-[9px] font-bold uppercase tracking-[0.26em]"
            style={{ color: RED_400 }}
          >
            At the podium · Pick {latestLocked.overallPick}
          </span>
        </div>
        <p
          className="leading-[1.2] tracking-[-0.005em]"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 26,
            color: CREAM_50,
            textTransform: "uppercase",
          }}
        >
          &ldquo;{caption}&rdquo;
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reactions feed — latest locked picks with their AI-generated one-liners.
// ---------------------------------------------------------------------------

function ReactionsFeed({ picks }: { picks: PickDetail[] }) {
  const lockedDesc = picks
    .filter((p) => p.status === "locked" && p.player?.fullName)
    .sort((a, b) => (b.lockedAt?.getTime() ?? 0) - (a.lockedAt?.getTime() ?? 0))
    .slice(0, 6);

  if (lockedDesc.length === 0) return null;

  return (
    <section className="px-8 pb-10">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: CREAM_200 }}>
          Pick Reactions
        </h2>
        <span
          className="rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em]"
          style={{ backgroundColor: `${RED_900}CC`, color: RED_400 }}
        >
          Live
        </span>
      </div>
      <ul
        className="divide-y rounded-sm border"
        style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC`, /* use border color for divider */ }}
      >
        {lockedDesc.map((p) => {
          const mgr = p.slot.teamName?.trim() || p.slot.user.displayName;
          return (
            <li
              key={p.id}
              className="flex items-start gap-4 border-t first:border-t-0 px-5 py-3"
              style={{ borderColor: `${NAVY_700}80` }}
            >
              <span
                className="mt-0.5 w-14 shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] tabular-nums"
                style={{ color: CREAM_400 }}
              >
                {p.round}.{String(p.pickInRound).padStart(2, "0")}
              </span>
              <span className="flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: CREAM_200 }}>
                  {mgr}
                  <span style={{ color: CREAM_400 }}> took </span>
                  <span style={{ color: CREAM_50 }}>{p.player?.fullName}</span>
                  {p.player?.team && (
                    <>
                      <span style={{ color: CREAM_400 }}> · </span>
                      <span style={{ color: CREAM_200 }}>{p.player.team}</span>
                    </>
                  )}
                </span>
                {p.reaction?.body ? (
                  <span
                    className="mt-1 block text-[13px] leading-[1.45]"
                    style={{ color: CREAM_50 }}
                  >
                    {p.reaction.body}
                  </span>
                ) : (
                  <span
                    className="mt-1 block text-[12px] italic"
                    style={{ color: CREAM_400 }}
                  >
                    [ reaction queued… ]
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Footer({ season }: { season: string }) {
  return (
    <footer
      className="flex items-center justify-between border-t px-8 py-6 text-[10px] font-bold uppercase tracking-[0.26em]"
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
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-8 py-12">
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
              <MLFShield className="h-[120px] w-auto" />
            </div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.26em]"
              style={{ color: CREAM_400 }}
            >
              Mens League of Football
            </p>
            <h1
              className="leading-[0.9] tracking-[-0.015em]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 56,
                color: CREAM_50,
                textTransform: "uppercase",
              }}
            >
              Rookie Draft <span style={{ color: RED_500 }}>/</span> 2026
            </h1>
          </header>
          <section
            className="mt-10 rounded-sm border p-8"
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
