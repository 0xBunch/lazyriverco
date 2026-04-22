"use client";

import { useEffect, useMemo, useState } from "react";
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
      <div className="rounded-lg border border-bone-800 bg-bone-900/40 p-6 text-center">
        <h1 className="font-display text-lg font-semibold text-bone-100">
          Player not found
        </h1>
        <p className="mt-2 text-sm text-bone-400">
          Sleeper id <code className="text-bone-200">{profile.playerId}</code>{" "}
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
          className="h-18 w-18 rounded-full border border-bone-800 bg-bone-900 object-cover"
          unoptimized
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-18 w-18 items-center justify-center rounded-full border border-bone-800 bg-bone-900 text-2xl text-bone-400"
        >
          {initials(profile.fullName)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50 text-balance">
          {profile.fullName}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-bone-300">
          {profile.position ? <span>{profile.position}</span> : null}
          {profile.team ? (
            <>
              <span aria-hidden="true" className="text-bone-600">
                ·
              </span>
              <span>{profile.team}</span>
            </>
          ) : null}
          {profile.injuryStatus ? (
            <>
              <span aria-hidden="true" className="text-bone-600">
                ·
              </span>
              <span className="rounded border border-claude-700/60 px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-claude-200">
                {profile.injuryStatus}
              </span>
            </>
          ) : null}
          {!profile.active ? (
            <>
              <span aria-hidden="true" className="text-bone-600">
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
      <p className="text-sm text-bone-400">
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
          className="rounded-lg border border-bone-800 bg-bone-900/40 p-3"
        >
          <div className="text-[11px] uppercase tracking-wider text-bone-400">
            {c.label}
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-bone-50 tabular-nums">
            {c.primary}
          </div>
          {c.secondary ? (
            <div className="mt-0.5 text-xs text-bone-400 tabular-nums">
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
    <section className="rounded-lg border border-bone-800 bg-bone-900/40 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-bone-300">
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
            <span className="text-bone-400">{w.pts.toFixed(0)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RosterBadges({ profile }: { profile: PlayerProfile }) {
  if (profile.rosteredBy.length === 0) {
    return (
      <div className="rounded-lg border border-bone-800 bg-bone-900/40 p-4 text-sm text-bone-400">
        Not currently on any MLF roster.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-bone-800 bg-bone-900/40 p-4">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-bone-300">
        MLF ownership
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {profile.rosteredBy.map((r) => (
          <li
            key={`${r.season}-${r.rosterId}`}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="text-bone-100">
              {r.managerDisplayName}
              {r.teamName ? (
                <span className="ml-1 text-bone-400">· {r.teamName}</span>
              ) : null}
            </span>
            <span className="text-xs uppercase tracking-wider text-bone-400">
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
    <section className="rounded-lg border border-bone-800 bg-bone-900/40 p-4">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-bone-300">
        What the clubhouse thinks
      </h2>
      {takes === null ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "h-12 animate-pulse rounded-md bg-bone-800/50",
                i === 1 ? "w-[80%]" : i === 2 ? "w-[65%]" : "w-full",
              )}
            />
          ))}
        </div>
      ) : takes.length === 0 ? (
        <p className="mt-2 text-sm text-bone-400">
          {error ?? "No takes yet — agents will chime in next time."}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-bone-800/60">
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
                  className="h-12 w-12 flex-shrink-0 rounded-full border border-bone-800 bg-bone-900 object-cover"
                  unoptimized
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-bone-800 bg-bone-900 text-sm text-bone-400"
                >
                  {initials(t.characterName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <blockquote className="font-display text-base leading-snug text-bone-50 text-pretty before:mr-1 before:text-bone-500 before:content-['\201C'] after:ml-0.5 after:text-bone-500 after:content-['\201D']">
                  {t.take}
                </blockquote>
                <div className="mt-1 text-xs font-medium text-bone-400">
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

function PartnerCard({ playerId }: { playerId: string }) {
  const [partner, setPartner] = useState<PartnerRow | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPartner(undefined);
    setError(null);
    setImageBroken(false);
    fetch(`/api/sleeper/players/${encodeURIComponent(playerId)}/partner`)
      .then((res) => res.json())
      .then((body: { partner?: PartnerRow | null; error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
          setPartner(null);
          return;
        }
        setPartner(body.partner ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setPartner(null);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return (
    <section className="rounded-lg border border-bone-800 bg-bone-900/40 p-4">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-bone-300">
        Partner
      </h2>
      {partner === undefined ? (
        <div className="mt-4 flex items-start gap-4">
          <div className="h-14 w-14 flex-shrink-0 animate-pulse rounded-full bg-bone-800/60" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-bone-800/60" />
            <div className="h-3 w-full animate-pulse rounded bg-bone-800/40" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-bone-800/40" />
          </div>
        </div>
      ) : partner === null || partner.relationship === "not_found" ? (
        <p className="mt-2 text-sm text-bone-400">
          {error ?? "No public info found."}
        </p>
      ) : (
        <div className="mt-4 flex items-start gap-4">
          {partner.imageUrl && !imageBroken ? (
            // Hotlinked image from the Wikimedia whitelist (server-side
            // validator enforces). Native <img> (not next/image) because
            // we're intentionally not proxying; on load failure fall through
            // to the initials avatar.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={partner.imageUrl}
              alt=""
              width={56}
              height={56}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageBroken(true)}
              className="h-14 w-14 flex-shrink-0 rounded-full border border-bone-800 bg-bone-900 object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-bone-800 bg-bone-900 text-sm text-bone-400"
            >
              {partner.name ? initials(partner.name) : "??"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate font-display text-base font-semibold text-bone-50 text-balance">
                {partner.name ?? "Unknown"}
              </h3>
              {/* Single claude-accent spot on the card — relationship is
                  the one semantic signal that earns the dusty-rose. */}
              <span className="flex-shrink-0 rounded-full border border-claude-700/70 px-2 py-0.5 text-[11px] uppercase tracking-widest text-claude-200">
                {RELATIONSHIP_LABEL[partner.relationship]}
              </span>
            </div>
            {partner.notableFact ? (
              <p className="mt-1.5 text-sm text-bone-200 text-pretty">
                {partner.notableFact}
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-3 text-[11px] text-bone-500">
              {partner.sourceUrl ? (
                <a
                  href={partner.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:text-bone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
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
      )}
    </section>
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
