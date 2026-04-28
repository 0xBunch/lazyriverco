"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PlayerProfile } from "@/lib/sleeper";
import type { PartnerRow } from "@/lib/player-partner";

type TakeRow = {
  characterId: string;
  characterName: string;
  characterAvatarUrl: string | null;
  take: string;
};

export function PlayerProfileView({
  profile,
  partnersEnabled,
}: {
  profile: PlayerProfile;
  partnersEnabled: boolean;
}) {
  if (profile.notFound) {
    return (
      <div className="rounded-lg border border-bone-200 bg-bone-100 p-6 text-center">
        <h1 className="font-display text-lg font-semibold text-bone-900">
          Player not found
        </h1>
        <p className="mt-2 text-sm text-bone-600">
          Sleeper id <code className="text-bone-800">{profile.playerId}</code>{" "}
          isn&apos;t in the MLF database yet. If this looks wrong, an admin can
          re-sync from the /fantasy page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderBlock profile={profile} />
      <StatCards profile={profile} />
      {profile.stats && profile.stats.weeklyPpr.length > 1 ? (
        <WeeklySparkline
          season={profile.stats.season}
          weekly={profile.stats.weeklyPpr}
        />
      ) : null}
      <RosterBadges profile={profile} />
      {partnersEnabled ? (
        <div className="grid gap-6 md:grid-cols-2">
          <AgentTakes playerId={profile.playerId} />
          <PartnerCard playerId={profile.playerId} />
        </div>
      ) : (
        <AgentTakes playerId={profile.playerId} />
      )}
    </div>
  );
}

function HeaderBlock({ profile }: { profile: PlayerProfile }) {
  const avatar = buildHeadshot(profile.playerId);
  return (
    <header className="flex items-start gap-4">
      {avatar ? (
        <Image
          src={avatar}
          alt=""
          width={72}
          height={72}
          className="h-18 w-18 rounded-full border border-bone-200 bg-bone-100 object-cover"
          unoptimized
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-18 w-18 items-center justify-center rounded-full border border-bone-200 bg-bone-100 text-2xl text-bone-600"
        >
          {initials(profile.fullName)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-950 text-balance">
          {profile.fullName}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-bone-700">
          {profile.position ? <span>{profile.position}</span> : null}
          {profile.team ? (
            <>
              <span aria-hidden="true" className="text-bone-400">
                ·
              </span>
              <span>{profile.team}</span>
            </>
          ) : null}
          {profile.injuryStatus ? (
            <>
              <span aria-hidden="true" className="text-bone-400">
                ·
              </span>
              <span className="rounded border border-claude-700/60 px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-claude-800">
                {profile.injuryStatus}
              </span>
            </>
          ) : null}
          {!profile.active ? (
            <>
              <span aria-hidden="true" className="text-bone-400">
                ·
              </span>
              <span className="text-bone-500">inactive</span>
            </>
          ) : null}
        </p>
      </div>
    </header>
  );
}

function StatCards({ profile }: { profile: PlayerProfile }) {
  const cards: {
    label: string;
    primary: string;
    secondary: string | null;
  }[] = [];
  if (profile.stats) {
    cards.push({
      label: `${profile.stats.season} PPR`,
      primary: profile.stats.ptsPpr.toFixed(1),
      secondary: `${profile.stats.gamesPlayed} games`,
    });
    if (profile.stats.rankPpr) {
      cards.push({
        label: "Overall rank",
        primary: `#${profile.stats.rankPpr}`,
        secondary:
          profile.stats.posRankPpr && profile.position
            ? `${profile.position}${profile.stats.posRankPpr}`
            : null,
      });
    }
  }
  if (profile.projection) {
    cards.push({
      label: `${profile.projection.season} projection`,
      primary: profile.projection.ptsPpr.toFixed(1),
      secondary: `${profile.projection.gamesPlayed} games proj.`,
    });
    if (profile.projection.adpPpr != null && profile.projection.adpPpr < 999) {
      cards.push({
        label: "ADP (PPR)",
        primary: profile.projection.adpPpr.toFixed(1),
        secondary: null,
      });
    }
  }
  if (cards.length === 0) {
    return (
      <p className="text-sm text-bone-600">
        No stats or projections available for this player yet. Stats sync runs
        once a day; try again after the next sync.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c, i) => (
        <div
          key={`${c.label}-${i}`}
          className="rounded-lg border border-bone-200 bg-bone-100 p-3"
        >
          <div className="text-[11px] uppercase tracking-wider text-bone-600">
            {c.label}
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-bone-950 tabular-nums">
            {c.primary}
          </div>
          {c.secondary ? (
            <div className="mt-0.5 text-xs text-bone-600 tabular-nums">
              {c.secondary}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WeeklySparkline({
  season,
  weekly,
}: {
  season: string;
  weekly: { week: number; pts: number }[];
}) {
  const { path, points, max, avg, avgY } = useMemo(() => {
    const pts = weekly.map((w) => w.pts);
    const maxPts = Math.max(10, ...pts);
    const avgPts = pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length);
    const width = 600;
    const height = 120;
    const padX = 8;
    const padY = 8;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const n = weekly.length;
    const xStep = n > 1 ? innerW / (n - 1) : 0;
    const coord = (i: number, v: number) => {
      const x = padX + i * xStep;
      const y = padY + innerH * (1 - v / maxPts);
      return { x, y };
    };
    const pathD = weekly
      .map((w, i) => {
        const { x, y } = coord(i, w.pts);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return {
      path: pathD,
      max: maxPts,
      avg: avgPts,
      avgY: padY + innerH * (1 - avgPts / maxPts),
      points: weekly.map((w, i) => {
        const { x, y } = coord(i, w.pts);
        return { x, y, pts: w.pts, week: w.week };
      }),
    };
  }, [weekly]);

  return (
    <section className="rounded-lg border border-bone-200 bg-bone-100 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-bone-700">
          {season} week-by-week
        </h2>
        <span className="text-xs text-bone-500 tabular-nums">
          avg {avg.toFixed(1)} · peak {max.toFixed(1)}
        </span>
      </div>
      <svg
        role="img"
        aria-label={`${season} weekly PPR points — average ${avg.toFixed(1)}, peak ${max.toFixed(1)}`}
        viewBox="0 0 600 120"
        preserveAspectRatio="none"
        className="h-28 w-full"
      >
        {/* Season-average reference line — an honest anchor for the
            rescaled max, so a career-low week isn't implied to be "big". */}
        <line
          x1={8}
          x2={592}
          y1={avgY}
          y2={avgY}
          stroke="rgb(155 151 141 / 0.3)"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
        <path
          d={path}
          fill="none"
          stroke="rgb(198 194 181)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle
            key={p.week}
            cx={p.x}
            cy={p.y}
            r={2}
            fill="rgb(250 249 245)"
          />
        ))}
      </svg>
      <ol className="mt-2 flex justify-between text-[11px] tabular-nums text-bone-500">
        {weekly.map((w) => (
          <li key={w.week} className="flex flex-col items-center gap-0.5">
            <span>W{w.week}</span>
            <span className="text-bone-600">{w.pts.toFixed(0)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RosterBadges({ profile }: { profile: PlayerProfile }) {
  if (profile.rosteredBy.length === 0) {
    return (
      <div className="rounded-lg border border-bone-200 bg-bone-100 p-4 text-sm text-bone-600">
        Not currently on any MLF roster.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-bone-200 bg-bone-100 p-4">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-bone-700">
        MLF ownership
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {profile.rosteredBy.map((r) => (
          <li
            key={`${r.season}-${r.rosterId}`}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="text-bone-900">
              {r.managerDisplayName}
              {r.teamName ? (
                <span className="ml-1 text-bone-600">· {r.teamName}</span>
              ) : null}
            </span>
            <span className="text-xs uppercase tracking-wider text-bone-600">
              {r.slot} · {r.season}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentTakes({ playerId }: { playerId: string }) {
  const [takes, setTakes] = useState<TakeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTakes(null);
    setError(null);
    fetch(`/api/sleeper/players/${encodeURIComponent(playerId)}/take`)
      .then((res) => res.json())
      .then((body: { takes?: TakeRow[]; error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
          setTakes([]);
          return;
        }
        setTakes(body.takes ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setTakes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return (
    <section className="rounded-lg border border-bone-200 bg-bone-100 p-4">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-bone-700">
        What the clubhouse thinks
      </h2>
      {takes === null ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "h-12 animate-pulse rounded-md bg-bone-200/50",
                i === 1 ? "w-[80%]" : i === 2 ? "w-[65%]" : "w-full",
              )}
            />
          ))}
        </div>
      ) : takes.length === 0 ? (
        <p className="mt-2 text-sm text-bone-600">
          {error ?? "No takes yet — agents will chime in next time."}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-bone-200/60">
          {takes.map((t) => (
            <li
              key={t.characterId}
              className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
            >
              {t.characterAvatarUrl ? (
                <Image
                  src={t.characterAvatarUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 flex-shrink-0 rounded-full border border-bone-200 bg-bone-100 object-cover"
                  unoptimized
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-bone-200 bg-bone-100 text-sm text-bone-600"
                >
                  {initials(t.characterName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <blockquote className="font-display text-base leading-snug text-bone-950 text-pretty before:mr-1 before:text-bone-500 before:content-['\201C'] after:ml-0.5 after:text-bone-500 after:content-['\201D']">
                  {t.take}
                </blockquote>
                <div className="mt-1 text-xs font-medium text-bone-600">
                  — {t.characterName}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const RELATIONSHIP_LABEL: Record<PartnerRow["relationship"], string> = {
  wife: "Wife",
  fiancee: "Fiancée",
  girlfriend: "Girlfriend",
  partner: "Partner",
  not_found: "—",
};

// Three-phase WAGFINDER search lifecycle:
//   - idle: no cached row yet, button visible
//   - searching: POST in flight, animated loader + rotating status
//   - result: populated row rendered (or "no public info found" if
//     Gemini came back not_found)
// We do a lightweight GET on mount to discover whether there's already
// a cached hit — that's instant and doesn't burn Gemini. The button
// explicitly kicks off the expensive POST pipeline.

type WagStatus = "idle" | "searching" | "result" | "error";

// Status messages cycled through while the POST is in flight. Rotating
// copy sells the "it's actually doing work" feeling instead of a silent
// spinner for 20s. Order mirrors what the server actually does.
const WAG_SEARCH_PHASES = [
  "Combing the open web…",
  "Cross-checking sources…",
  "Looking for a photo…",
  "Almost there…",
];
const WAG_PHASE_INTERVAL_MS = 3500;

function PartnerCard({ playerId }: { playerId: string }) {
  const [partner, setPartner] = useState<PartnerRow | null | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<WagStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [imageBroken, setImageBroken] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);

  // On mount: read-only cache lookup. If a row exists (even a not_found
  // one), drop straight into the result state — the user already asked
  // before. If it's genuinely empty, idle state shows the button.
  useEffect(() => {
    let cancelled = false;
    setPartner(undefined);
    setStatus("idle");
    setError(null);
    setImageBroken(false);
    fetch(`/api/sleeper/players/${encodeURIComponent(playerId)}/partner`)
      .then((res) => res.json())
      .then((body: { partner?: PartnerRow | null; error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
          setStatus("error");
          return;
        }
        if (body.partner) {
          setPartner(body.partner);
          setStatus("result");
        } else {
          setPartner(null);
          setStatus("idle");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  // Rotate the "searching…" status text. Stops as soon as we leave the
  // searching state.
  useEffect(() => {
    if (status !== "searching") return;
    setPhaseIndex(0);
    const t = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % WAG_SEARCH_PHASES.length);
    }, WAG_PHASE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [status]);

  const runFinder = useCallback(async () => {
    setStatus("searching");
    setError(null);
    setImageBroken(false);
    try {
      const res = await fetch(
        `/api/sleeper/players/${encodeURIComponent(playerId)}/partner`,
        { method: "POST" },
      );
      const body = (await res.json()) as {
        partner?: PartnerRow | null;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Search failed (${res.status})`);
        setStatus("error");
        return;
      }
      setPartner(body.partner ?? null);
      setStatus("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setStatus("error");
    }
  }, [playerId]);

  return (
    <section className="rounded-lg border border-bone-200 bg-bone-100 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-bone-700">
          WAG
        </h2>
        {status === "result" &&
        partner &&
        partner.relationship !== "not_found" ? (
          <button
            type="button"
            onClick={runFinder}
            className="text-[11px] uppercase tracking-wider text-bone-500 hover:text-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            title="Re-run WAGFINDER"
          >
            re-roll
          </button>
        ) : null}
      </div>

      {status === "idle" || partner === undefined ? (
        <WagIdle onClick={runFinder} disabled={partner === undefined} />
      ) : status === "searching" ? (
        <WagSearching phase={WAG_SEARCH_PHASES[phaseIndex]!} />
      ) : status === "error" ? (
        <WagError message={error} onRetry={runFinder} />
      ) : partner === null || partner.relationship === "not_found" ? (
        <WagNotFound onRetry={runFinder} />
      ) : (
        <WagResult
          playerId={playerId}
          partner={partner}
          imageBroken={imageBroken}
          onImageBroken={() => setImageBroken(true)}
        />
      )}
    </section>
  );
}

function WagIdle({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col items-start gap-3">
      <p className="text-sm text-bone-700 text-pretty">
        Run WAGFINDER to scour the web for this player&apos;s wife, fiancée,
        or girlfriend. Takes about 15-30 seconds; result is cached after.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-claude-700 bg-claude-900/30 px-3 py-1.5 text-sm font-medium text-claude-900 transition-colors",
          "hover:border-claude-500 hover:bg-claude-900/60 hover:text-claude-950",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span aria-hidden="true" className="text-xs">
          ♡
        </span>
        Run WAGFINDER
      </button>
    </div>
  );
}

function WagSearching({ phase }: { phase: string }) {
  return (
    <div className="mt-4 flex items-center gap-4">
      <div
        aria-hidden="true"
        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-bone-200 bg-bone-100"
      >
        <WagSpinner />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-base font-semibold text-bone-900">
          WAGFINDER working…
        </div>
        <div
          aria-live="polite"
          aria-atomic="true"
          className="mt-1 text-sm text-bone-600 text-pretty transition-opacity"
        >
          {phase}
        </div>
      </div>
    </div>
  );
}

function WagSpinner() {
  // Bone-palette concentric-ring spinner. Uses animate-spin (compositor-
  // only transform) + a conic gradient mask so we stay inside the
  // "no gratuitous motion, compositor props only" constraint.
  return (
    <span
      role="status"
      aria-label="Searching"
      className="relative inline-block h-6 w-6"
    >
      <span className="absolute inset-0 rounded-full border-2 border-bone-200" />
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-claude-400 border-r-claude-500" />
    </span>
  );
}

function WagNotFound({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <p className="text-sm text-bone-600">
        No public info found. Could be a private player, or the web&apos;s
        quiet on this one.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-[11px] uppercase tracking-wider text-bone-500 hover:text-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
      >
        try again
      </button>
    </div>
  );
}

function WagError({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <p className="text-sm text-claude-800 text-pretty">
        {message ?? "Search failed."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-md border border-claude-700 bg-claude-900/30 px-3 py-1.5 text-sm font-medium text-claude-900 hover:border-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
      >
        Try again
      </button>
    </div>
  );
}

function WagResult({
  playerId,
  partner,
  imageBroken,
  onImageBroken,
}: {
  playerId: string;
  partner: PartnerRow;
  imageBroken: boolean;
  onImageBroken: () => void;
}) {
  return (
    <div className="mt-4 flex items-start gap-4">
      {partner.imageUrl && !imageBroken ? (
        // Proxied image — the server-side /partner/image route fetches
        // partner.imageUrl and streams the bytes back from our origin,
        // so Instagram/Getty hotlink blockers + CORS + referrer policies
        // don't apply. On any proxy failure (upstream 403, non-image
        // response, size cap, whatever) the <img> onError flips to
        // initials and we move on.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/sleeper/players/${encodeURIComponent(playerId)}/partner/image`}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          onError={onImageBroken}
          className="h-14 w-14 flex-shrink-0 rounded-full border border-bone-200 bg-bone-100 object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-bone-200 bg-bone-100 text-sm text-bone-600"
        >
          {partner.name ? initials(partner.name) : "??"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate font-display text-base font-semibold text-bone-950 text-balance">
            {partner.name ?? "Unknown"}
          </h3>
          {/* Single claude-accent spot on the card — relationship is
              the one semantic signal that earns the dusty-rose. */}
          <span className="flex-shrink-0 rounded-full border border-claude-700/70 px-2 py-0.5 text-[11px] uppercase tracking-widest text-claude-800">
            {RELATIONSHIP_LABEL[partner.relationship]}
          </span>
        </div>
        {partner.notableFact ? (
          <p className="mt-1.5 text-sm text-bone-800 text-pretty">
            {partner.notableFact}
          </p>
        ) : null}
        {partner.instagramHandle ? (
          <a
            href={`https://instagram.com/${partner.instagramHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-block text-sm text-claude-700 underline-offset-2 hover:text-claude-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
          >
            @{partner.instagramHandle}
          </a>
        ) : null}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-bone-500">
          {partner.sourceUrl ? (
            <a
              href={partner.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:text-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              source · {sourceDomain(partner.sourceUrl)}
            </a>
          ) : null}
          {partner.confidence === "low" ? (
            <span className="italic text-bone-500">low confidence</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

/** Sleeper serves their own headshots at a predictable URL. Some players
 *  (practice squad, recent signings) 404 — the Image component handles
 *  the broken-image state with alt="" so visually the fallback initials
 *  block just renders if we skip the image. */
function buildHeadshot(playerId: string): string | null {
  if (!playerId || !/^\d+$/.test(playerId)) return null;
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}
