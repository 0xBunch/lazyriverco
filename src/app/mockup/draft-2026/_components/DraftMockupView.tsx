import Link from "next/link";
import Image from "next/image";

// ---------------------------------------------------------------------------
// Shared draft-room view. Uses CSS variables --font-display and --font-ui
// so parent wrappers can swap type pairings without touching markup.
// ---------------------------------------------------------------------------

// MLF palette (consider promoting to tailwind.config on real impl).
const NAVY_950 = "#070E20";
const NAVY_900 = "#0B1A33";
const NAVY_800 = "#12294A";
const NAVY_700 = "#1B3A66";
const NAVY_600 = "#2A4F85";
const NAVY_500 = "#3D689E";
const RED_500 = "#C8102E";
const RED_400 = "#E23A52";
const RED_900 = "#4A0914";
const CREAM_50 = "#F5F1E6";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";
const GRASS_600 = "#2E5A3A";

type RookieStatus = "open" | "on-clock" | "taken";

const rookies: Array<{
  n: string;
  name: string;
  pos: string;
  nfl: string;
  col: string;
  dft: string;
  adp: string;
  status: RookieStatus;
}> = [
  { n: "01", name: "Fernando Mendoza",   pos: "QB", nfl: "LV",  col: "Indiana",     dft: "1.06", adp: "1.08", status: "on-clock" },
  { n: "02", name: "Cam Skattebo",       pos: "RB", nfl: "NYG", col: "Arizona St",  dft: "1.10", adp: "1.14", status: "open"     },
  { n: "03", name: "Luther Burden III",  pos: "WR", nfl: "CHI", col: "Missouri",    dft: "1.15", adp: "1.22", status: "open"     },
  { n: "04", name: "Tez Johnson",        pos: "WR", nfl: "TB",  col: "Oregon",      dft: "2.04", adp: "2.01", status: "open"     },
  { n: "05", name: "Ashton Jeanty",      pos: "RB", nfl: "DEN", col: "Boise St",    dft: "1.05", adp: "1.03", status: "taken"    },
  { n: "06", name: "Travis Hunter",      pos: "WR", nfl: "JAX", col: "Colorado",    dft: "1.02", adp: "1.01", status: "taken"    },
  { n: "07", name: "Tyler Warren",       pos: "TE", nfl: "IND", col: "Penn St",     dft: "1.14", adp: "1.28", status: "taken"    },
  { n: "08", name: "Colston Loveland",   pos: "TE", nfl: "CHI", col: "Michigan",    dft: "1.10", adp: "2.03", status: "taken"    },
  { n: "09", name: "Omarion Hampton",    pos: "RB", nfl: "LAC", col: "UNC",         dft: "1.22", adp: "1.34", status: "open"     },
  { n: "10", name: "Emeka Egbuka",       pos: "WR", nfl: "TB",  col: "Ohio St",     dft: "1.19", adp: "1.37", status: "open"     },
  { n: "11", name: "Matthew Golden",     pos: "WR", nfl: "GB",  col: "Texas",       dft: "1.23", adp: "1.41", status: "open"     },
  { n: "12", name: "Kaleb Johnson",      pos: "RB", nfl: "PIT", col: "Iowa",        dft: "3.19", adp: "1.44", status: "open"     },
  { n: "13", name: "TreVeyon Henderson", pos: "RB", nfl: "NE",  col: "Ohio St",     dft: "2.06", adp: "1.48", status: "open"     },
  { n: "14", name: "Quinshon Judkins",   pos: "RB", nfl: "CLE", col: "Ohio St",     dft: "2.04", adp: "2.07", status: "open"     },
];

type CellStatus = "empty" | "taken" | "current";

const boardRounds: Array<{
  label: string;
  cells: Array<{ manager: string; pickId: string; pick: string; status: CellStatus }>;
}> = [
  {
    label: "R1",
    cells: [
      { manager: "Henry",    pickId: "1.01", pick: "Jeanty",   status: "taken"   },
      { manager: "Daniel",   pickId: "1.02", pick: "Hunter",   status: "taken"   },
      { manager: "Leo",      pickId: "1.03", pick: "Warren",   status: "taken"   },
      { manager: "Ori",      pickId: "1.04", pick: "Loveland", status: "taken"   },
      { manager: "Maverick", pickId: "1.05", pick: "—",        status: "current" },
      { manager: "Gus",      pickId: "1.06", pick: "—",        status: "empty"   },
      { manager: "Jonah",    pickId: "1.07", pick: "—",        status: "empty"   },
      { manager: "Isaac",    pickId: "1.08", pick: "—",        status: "empty"   },
    ],
  },
  {
    label: "R2",
    cells: [
      { manager: "Isaac",    pickId: "2.01", pick: "—", status: "empty" },
      { manager: "Jonah",    pickId: "2.02", pick: "—", status: "empty" },
      { manager: "Gus",      pickId: "2.03", pick: "—", status: "empty" },
      { manager: "Maverick", pickId: "2.04", pick: "—", status: "empty" },
      { manager: "Ori",      pickId: "2.05", pick: "—", status: "empty" },
      { manager: "Leo",      pickId: "2.06", pick: "—", status: "empty" },
      { manager: "Daniel",   pickId: "2.07", pick: "—", status: "empty" },
      { manager: "Henry",    pickId: "2.08", pick: "—", status: "empty" },
    ],
  },
  {
    label: "R3",
    cells: [
      { manager: "Henry",    pickId: "3.01", pick: "—", status: "empty" },
      { manager: "Daniel",   pickId: "3.02", pick: "—", status: "empty" },
      { manager: "Leo",      pickId: "3.03", pick: "—", status: "empty" },
      { manager: "Ori",      pickId: "3.04", pick: "—", status: "empty" },
      { manager: "Maverick", pickId: "3.05", pick: "—", status: "empty" },
      { manager: "Gus",      pickId: "3.06", pick: "—", status: "empty" },
      { manager: "Jonah",    pickId: "3.07", pick: "—", status: "empty" },
      { manager: "Isaac",    pickId: "3.08", pick: "—", status: "empty" },
    ],
  },
];

const reactions = [
  { pick: "1.04", body: "Ori goes chalk with Loveland — Bears get their seam-stretcher, dynasty cred locked in." },
  { pick: "1.03", body: "Leo grabs Warren a pick early; TE1 ceiling but he paid retail for it." },
  { pick: "1.02", body: "Hunter to Daniel. No-brainer — Jacksonville's new toy plays both sides of the ball." },
  { pick: "1.01", body: "Henry takes Jeanty at 1.01. Steady hand, steady pick, no feathers ruffled." },
];

const scoutingReport = `Mendoza arrives in Las Vegas as the rare dual-threat pocket QB who tightened his mechanics between Cal and his breakout 2025 at Indiana (3,004 yd, 29 TD, 6 INT, 68.7%). He processes field-side reads faster than most rookies, climbs the pocket cleanly, and layers throws over intermediate zones — translates immediately to Chip Kelly's tempo.

Concerns: durability after two lower-body scares; still over-trusts his arm on boundary reps. Fantasy outlook: QB1 upside in a spread that maximizes RPOs, with a plus running floor if the Raiders lean into designed keeps. In a 3-round rookie draft, he's the QB1.`;

// ---------------------------------------------------------------------------

export default function DraftMockupView() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: NAVY_950,
        color: CREAM_50,
        fontFamily: "var(--font-ui)",
      }}
    >
      <TurfTexture />
      <ShieldWatermark />

      <main className="relative mx-auto max-w-[1440px]">
        <TopBar />
        <Hero />
        <StatusRow />
        <Body />
        <DraftBoard />
        <LowerRow />
        <Footer />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambient: procedural turf noise + oversized ghost shield in margin
// ---------------------------------------------------------------------------

function TurfTexture() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 h-full w-full opacity-[0.055]"
    >
      <defs>
        <filter id="turf-noise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="7" />
          <feColorMatrix
            values="0 0 0 0 0.18
                    0 0 0 0 0.36
                    0 0 0 0 0.23
                    0 0 0 0.85 0"
          />
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
          <stop offset="60%" stopColor={GRASS_600} stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" filter="url(#turf-noise)" />
      <rect width="100%" height="100%" fill="url(#vignette)" />
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
// MLF shield — real asset at /public/mlf_logo.png (1024×1024 PNG).
// Component signature kept so every call site passes classNames like
// "h-[160px] w-auto" and gets correct sizing for free.
// ---------------------------------------------------------------------------

export function MLFShield({ className = "h-full w-full" }: { className?: string }) {
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
// Chrome
// ---------------------------------------------------------------------------

function TopBar() {
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
        <span style={{ color: NAVY_500 }}>·</span>
        <span>2026 · Rookie</span>
      </div>

      <div
        className="flex items-center gap-2 rounded-sm px-2.5 py-1.5"
        style={{ backgroundColor: NAVY_800 }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: RED_500 }}
        />
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: CREAM_50 }}
        >
          Maverick · Commissioner
        </span>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative px-8 pb-6 pt-10">
      <div className="flex items-center gap-8">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="absolute -inset-4 -z-10 rounded-full blur-2xl"
            style={{
              background: `radial-gradient(closest-side, ${RED_900}80 0%, transparent 70%)`,
            }}
          />
          <MLFShield className="h-[160px] w-auto drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]" />
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-4">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.26em]"
              style={{ color: CREAM_200 }}
            >
              Live draft · 2026 Rookie class
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em]"
              style={{ backgroundColor: RED_900, color: RED_400 }}
            >
              <span
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full motion-reduce:animate-none"
                style={{ backgroundColor: RED_500 }}
              />
              On air
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-[0.26em]"
              style={{ color: CREAM_400 }}
            >
              07 of 24 picks complete
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
            Pick 05{" "}
            <span style={{ color: RED_500, fontWeight: 900 }}>/</span>{" "}
            <span style={{ color: CREAM_200 }}>Round 1</span>
          </h1>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Status row: on-clock panel (spans Big Board width) + sponsor rail (spans
// Dossier width). Grid split mirrors the Body below for vertical alignment.
// ---------------------------------------------------------------------------

function StatusRow() {
  return (
    <section className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 px-8 pb-7">
      <OnClockPanel />
      <SponsorRail />
    </section>
  );
}

function OnClockPanel() {
  return (
    <div
      className="relative flex items-center gap-8 overflow-hidden rounded-sm border p-6"
      style={{
        borderColor: RED_500,
        backgroundColor: `${NAVY_900}CC`,
        boxShadow: `inset 0 0 0 1px ${RED_900}`,
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1"
        style={{ backgroundColor: RED_500 }}
      />

      <Field label="On the clock" accent>
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
          Maverick
        </div>
        <div
          className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: CREAM_200 }}
        >
          Austin Bats
        </div>
      </Field>

      <div className="h-16 w-px" style={{ backgroundColor: NAVY_600 }} />

      <Field label="Time remaining">
        <div
          className="leading-none tracking-[-0.01em] tabular-nums"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 36,
            color: RED_400,
          }}
        >
          14:22:31
        </div>
      </Field>

      <div className="h-16 w-px" style={{ backgroundColor: NAVY_600 }} />

      <Field label="On deck">
        <div className="text-[13px] font-semibold tracking-normal" style={{ color: CREAM_200 }}>
          Gus <span style={{ color: CREAM_400 }}>→</span> Henry{" "}
          <span style={{ color: CREAM_400 }}>→</span> Daniel
        </div>
      </Field>
    </div>
  );
}

const sponsorRotation = [
  {
    name: "Station Wagon Motors",
    tagline: "Moving the league since 2018.",
  },
  {
    name: "Lake Travis Marine",
    tagline: "Where the Mens League stores its ships.",
  },
  {
    name: "Joyce's Fine Wines",
    tagline: "Official pour of the 1.04 selection.",
  },
  {
    name: "Sunday Supply Co.",
    tagline: "Pads, pucks, and pickups. Weekend-approved.",
  },
];

function SponsorRail() {
  const current = sponsorRotation[0];
  const total = sponsorRotation.length;
  const position = 1;

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
          {String(position).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>

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
        {current.name}
      </div>

      <div
        className="text-[13px] italic leading-[1.35]"
        style={{ color: CREAM_200 }}
      >
        &ldquo;{current.tagline}&rdquo;
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        {sponsorRotation.map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: i === 0 ? RED_500 : NAVY_600,
            }}
          />
        ))}
        <span
          className="ml-3 text-[9px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_400 }}
        >
          [ placeholder · commissioner-managed ]
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.26em]"
        style={{ color: accent ? RED_400 : CREAM_400 }}
      >
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body: rookie board + dossier
// ---------------------------------------------------------------------------

function Body() {
  return (
    <section className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 px-8 pb-10">
      <RookieBoard />
      <Dossier />
    </section>
  );
}

function RookieBoard() {
  return (
    <div
      className="overflow-hidden rounded-sm border"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div
        className="flex items-center gap-5 border-b px-4 py-3"
        style={{ borderColor: NAVY_700 }}
      >
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_200 }}
        >
          Big Board
        </h2>
        <span className="h-3.5 w-px" style={{ backgroundColor: NAVY_600 }} />
        <nav className="flex items-center gap-4">
          {["All", "QB", "RB", "WR", "TE"].map((t, i) => (
            <button
              key={t}
              type="button"
              className="relative flex flex-col items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em]"
              style={{ color: i === 0 ? CREAM_50 : CREAM_400 }}
            >
              {t}
              {i === 0 && (
                <span
                  className="absolute -bottom-[7px] block h-[2px] w-4"
                  style={{ backgroundColor: RED_500 }}
                />
              )}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <span
          className="text-[10px] font-bold uppercase tracking-[0.22em] tabular-nums"
          style={{ color: CREAM_200 }}
        >
          62 avail
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_400 }}
        >
          Sort · ADP ↓
        </span>
      </div>

      <div
        className="grid grid-cols-[32px_minmax(0,2fr)_44px_44px_minmax(0,1.1fr)_60px_52px_128px] items-center gap-3 border-b px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.22em]"
        style={{
          borderColor: NAVY_700,
          backgroundColor: `${NAVY_950}80`,
          color: CREAM_400,
        }}
      >
        <span>#</span>
        <span>Name</span>
        <span>Pos</span>
        <span>NFL</span>
        <span>College</span>
        <span>Draft</span>
        <span>ADP</span>
        <span />
      </div>

      <div>
        {rookies.map((r, i) => (
          <RookieRow key={r.name} rookie={r} idx={i} />
        ))}
      </div>
    </div>
  );
}

function RookieRow({
  rookie,
  idx,
}: {
  rookie: (typeof rookies)[number];
  idx: number;
}) {
  const isOnClock = rookie.status === "on-clock";
  const isTaken = rookie.status === "taken";

  const rowBg = isOnClock
    ? `${RED_900}66`
    : idx % 2 === 0
    ? "transparent"
    : `${NAVY_800}55`;

  const nameColor = isOnClock ? RED_400 : isTaken ? CREAM_400 : CREAM_50;
  const otherColor = isTaken ? CREAM_400 : CREAM_200;
  const adpColor = isTaken ? CREAM_400 : CREAM_50;

  return (
    <div
      className="relative grid grid-cols-[32px_minmax(0,2fr)_44px_44px_minmax(0,1.1fr)_60px_52px_128px] items-center gap-3 border-b px-4 py-2.5 text-[12px] tabular-nums"
      style={{
        backgroundColor: rowBg,
        borderColor: `${NAVY_700}40`,
      }}
    >
      {isOnClock && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-0.5"
          style={{ backgroundColor: RED_500 }}
        />
      )}
      <span style={{ color: otherColor, fontWeight: 500 }}>{rookie.n}</span>
      <span
        className="truncate"
        style={{
          color: nameColor,
          fontWeight: 600,
          textDecoration: isTaken ? "line-through" : "none",
          textDecorationColor: CREAM_400,
        }}
      >
        {rookie.name}
        {isTaken && (
          <span
            className="ml-2 text-[9px] font-bold uppercase tracking-[0.22em]"
            style={{ color: CREAM_400, textDecoration: "none" }}
          >
            · Taken
          </span>
        )}
        {isOnClock && (
          <span
            className="ml-2 text-[9px] font-bold uppercase tracking-[0.22em]"
            style={{ color: RED_400 }}
          >
            · Selected
          </span>
        )}
      </span>
      <span style={{ color: otherColor, fontWeight: 600 }}>{rookie.pos}</span>
      <span style={{ color: otherColor, fontWeight: 600 }}>{rookie.nfl}</span>
      <span className="truncate" style={{ color: otherColor }}>
        {rookie.col}
      </span>
      <span style={{ color: otherColor }}>{rookie.dft}</span>
      <span style={{ color: adpColor, fontWeight: 600 }}>{rookie.adp}</span>
      <div className="flex items-center justify-end">
        {isOnClock ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2"
            style={{
              backgroundColor: RED_500,
              color: CREAM_50,
              boxShadow: `0 0 0 1px ${RED_400}`,
            }}
          >
            ◉ Lock pick
          </button>
        ) : isTaken ? (
          <span style={{ color: CREAM_400, fontSize: 11 }}>—</span>
        ) : (
          <span style={{ color: CREAM_400, fontSize: 11 }}>→</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dossier panel
// ---------------------------------------------------------------------------

function Dossier() {
  return (
    <aside
      className="overflow-hidden rounded-sm border"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div
        className="flex items-center gap-3 border-b px-5 py-3"
        style={{ borderColor: NAVY_700 }}
      >
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_200 }}
        >
          Dossier · Rookie #01
        </h2>
        <div className="flex-1" />
        <span style={{ color: CREAM_400, fontSize: 12 }}>✕</span>
      </div>

      <div className="flex flex-col gap-6 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ color: RED_400 }}
            >
              QB · Indiana Hoosiers
            </span>
            <div
              className="mt-1 leading-[0.86] tracking-[-0.01em]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 34,
                color: CREAM_50,
                textTransform: "uppercase",
              }}
            >
              Fernando
            </div>
            <div
              className="leading-[0.86] tracking-[-0.01em]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 34,
                color: CREAM_50,
                textTransform: "uppercase",
              }}
            >
              Mendoza
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-3"
                style={{ backgroundColor: RED_500 }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: CREAM_200 }}
              >
                LV Raiders · Rd 1, Pk 6
              </span>
            </div>
          </div>

          <div
            className="relative h-[128px] w-[100px] shrink-0 overflow-hidden rounded-sm border"
            style={{
              borderColor: NAVY_600,
              background: `linear-gradient(180deg, ${NAVY_700} 0%, ${NAVY_900} 100%)`,
            }}
            aria-label="Fernando Mendoza headshot placeholder"
          >
            <div
              className="absolute inset-0 flex items-center justify-center text-[8px] font-bold uppercase tracking-[0.22em]"
              style={{ color: CREAM_400 }}
            >
              Sleeper
            </div>
            <div
              className="absolute bottom-0 left-0 right-0 border-t px-2 py-1 text-center text-[8px] font-bold uppercase tracking-[0.18em]"
              style={{
                borderColor: NAVY_600,
                backgroundColor: `${NAVY_950}E6`,
                color: RED_400,
              }}
            >
              QB 01
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatCell label="Age" value="22" />
          <StatCell label="HT" value={`6'5″`} />
          <StatCell label="WT" value="225" />
          <StatCell label="40 time" value="4.73" />
          <StatCell label="ADP" value="1.08" highlight />
          <StatCell label="Bye" value="Wk 8" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ color: RED_400 }}
            >
              Scouting Report
            </span>
            <span
              className="rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em]"
              style={{ backgroundColor: NAVY_800, color: CREAM_200 }}
            >
              Claude Sonnet 4.6
            </span>
          </div>
          <p
            className="whitespace-pre-line text-[13px] leading-[1.65]"
            style={{ color: CREAM_50 }}
          >
            {scoutingReport}
          </p>
        </div>
      </div>
    </aside>
  );
}

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-sm border px-3 py-2.5"
      style={{
        borderColor: highlight ? `${RED_500}99` : NAVY_600,
        backgroundColor: highlight ? `${RED_900}80` : `${NAVY_800}66`,
      }}
    >
      <div
        className="text-[9px] font-bold uppercase tracking-[0.24em]"
        style={{ color: highlight ? RED_400 : CREAM_400 }}
      >
        {label}
      </div>
      <div
        className="mt-1 tabular-nums"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          color: highlight ? RED_400 : CREAM_50,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft board (snake grid)
// ---------------------------------------------------------------------------

function DraftBoard() {
  return (
    <section className="px-8 pb-8">
      <div className="mb-4 flex items-baseline gap-3">
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_200 }}
        >
          Draft Board
        </h2>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_400 }}
        >
          · Snake · 3 rounds × 8 managers
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {boardRounds.map((round) => (
          <div key={round.label} className="grid grid-cols-8 gap-2">
            {round.cells.map((cell) => (
              <SnakeCell key={cell.pickId} cell={cell} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function SnakeCell({
  cell,
}: {
  cell: (typeof boardRounds)[number]["cells"][number];
}) {
  const isCurrent = cell.status === "current";
  const isTaken = cell.status === "taken";

  const bg = isCurrent
    ? `${RED_900}99`
    : isTaken
    ? `${NAVY_800}`
    : `${NAVY_900}80`;

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
          {cell.pickId}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: isCurrent ? RED_400 : CREAM_200 }}
        >
          {cell.manager}
        </span>
      </div>
      {isCurrent ? (
        <span
          className="text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ color: RED_400 }}
        >
          ◉ On the clock
        </span>
      ) : isTaken ? (
        <span
          className="leading-tight"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 17,
            color: CREAM_50,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          {cell.pick}
        </span>
      ) : (
        <span style={{ color: CREAM_400, fontSize: 12 }}>—</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lower row: Goodell box + Pick reactions
// ---------------------------------------------------------------------------

function LowerRow() {
  return (
    <section className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-5 px-8 pb-8">
      <GoodellBox />
      <ReactionFeed />
    </section>
  );
}

function GoodellBox() {
  return (
    <div
      className="flex overflow-hidden rounded-sm border"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div
        className="relative flex h-[200px] w-[220px] shrink-0 flex-col items-center justify-center border-r text-center"
        style={{
          borderColor: NAVY_700,
          background: `linear-gradient(180deg, ${NAVY_700} 0%, ${NAVY_950} 100%)`,
        }}
      >
        <span
          className="text-[8px] font-bold uppercase tracking-[0.26em]"
          style={{ color: CREAM_400 }}
        >
          Announcer image
        </span>
        <span
          className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: CREAM_200 }}
        >
          Slot · Pick 04
        </span>
        <span
          className="mt-4 inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.2em]"
          style={{ borderColor: NAVY_600, color: CREAM_400 }}
        >
          [ commissioner upload ]
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3 px-7 py-6">
        <div className="flex items-center gap-3">
          <MLFShield className="h-6 w-auto" />
          <span
            className="text-[9px] font-bold uppercase tracking-[0.26em]"
            style={{ color: RED_400 }}
          >
            At the podium · Most recent pick
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
          &ldquo;With the fourth pick in the MLF Draft, Ori selects{" "}
          <span style={{ color: RED_400 }}>Colston Loveland</span>, Chicago Bears.&rdquo;
        </p>
        <div
          className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.26em]"
          style={{ color: CREAM_400 }}
        >
          <span>Pick 04</span>
          <span style={{ color: CREAM_400 }}>·</span>
          <span>Locked by Ori</span>
          <span style={{ color: CREAM_400 }}>·</span>
          <span>23 min ago</span>
        </div>
      </div>
    </div>
  );
}

function ReactionFeed() {
  return (
    <div
      className="rounded-sm border p-6"
      style={{ borderColor: NAVY_700, backgroundColor: `${NAVY_900}CC` }}
    >
      <div className="mb-4 flex items-center gap-3">
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_200 }}
        >
          Pick Reactions
        </h2>
        <span
          className="rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em]"
          style={{ backgroundColor: `${RED_900}CC`, color: RED_400 }}
        >
          Live
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {reactions.map((r) => (
          <li key={r.pick} className="flex items-start gap-3">
            <span
              className="mt-[2px] w-10 shrink-0 text-[10px] font-bold tracking-[0.18em] tabular-nums"
              style={{ color: CREAM_400 }}
            >
              {r.pick}
            </span>
            <span className="text-[12px] leading-[1.55]" style={{ color: CREAM_50 }}>
              {r.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer() {
  return (
    <footer
      className="flex items-center justify-between border-t px-8 py-6 text-[10px] font-bold uppercase tracking-[0.26em]"
      style={{ borderColor: NAVY_800, color: CREAM_400 }}
    >
      <span>
        MLF Draft 2026 <span style={{ color: CREAM_200 }}>·</span> Mockup · Phase 0
      </span>
      <span>
        Lazy River Co. <span style={{ color: CREAM_200 }}>·</span> {new Date().getFullYear()}
      </span>
    </footer>
  );
}
