import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getWagArchive,
  getWagInsights,
  isSportTag,
  type WagArchiveRow,
} from "@/lib/sports/wag-archive";
import { InstagramLink } from "@/components/social/InstagramLink";

export const dynamic = "force-dynamic";

// /sports/wags — public-side archive of every non-hidden SportsWag.
// Filterable by sport via ?sport=NFL search params. Sort is
// "most-recently-featured first" so the cover stars surface at the
// top, with never-featured roster entries falling through to
// alphabetical at the bottom of each sport bucket.
//
// Member-gated like the rest of /sports today; flip to public via
// removing the redirect when the org is ready to take it open.

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const;

type SearchParams = { sport?: string };

export default async function SportsWagsArchivePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/start");

  const requestedSport = (searchParams?.sport ?? "").trim().toUpperCase();
  const activeSport = isSportTag(requestedSport) ? requestedSport : null;

  const [rows, insights] = await Promise.all([
    getWagArchive(activeSport ? { sport: activeSport } : {}),
    getWagInsights(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pt-20 md:pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-bone-600">
            MLSN · WAG archive
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-bone-950 md:text-4xl">
            Wives &amp; girlfriends across pro sports
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-bone-700 md:text-base">
            {insights.totalWags} partner profiles, {insights.totalFeatures}{" "}
            scheduled feature{insights.totalFeatures === 1 ? "" : "s"} since
            launch. Editorially curated, AI-verified, hotlink-safe imagery.{" "}
            <Link
              href="/sports/wags/insights"
              className="font-medium text-bone-950 underline decoration-bone-400 underline-offset-4 hover:decoration-bone-700"
            >
              See insights →
            </Link>
          </p>
        </div>
      </header>

      {/* Sport filter pills. Clicking re-renders with ?sport=… in the
          URL; clicking the active pill clears the filter. */}
      <nav
        aria-label="Filter by sport"
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        <FilterPill href="/sports/wags" active={activeSport === null} label="All" />
        {SPORTS.map((s) => (
          <FilterPill
            key={s}
            href={
              activeSport === s ? "/sports/wags" : `/sports/wags?sport=${s}`
            }
            active={activeSport === s}
            label={s}
          />
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-bone-200 bg-bone-100 p-8 text-center text-sm italic text-bone-600">
          {activeSport
            ? `No ${activeSport} entries in the roster yet.`
            : "No WAGs in the roster yet."}{" "}
          {user.role === "ADMIN" ? (
            <Link
              href="/admin/sports/wags"
              className="font-medium text-bone-950 underline decoration-bone-400 underline-offset-4"
            >
              Add one →
            </Link>
          ) : null}
        </p>
      ) : (
        <ul
          role="list"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4"
        >
          {rows.map((row) => (
            <ArchiveCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterPill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-full bg-bone-950 px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-50"
          : "rounded-full border border-bone-300 bg-bone-100 px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-700 transition-colors hover:border-bone-700 hover:text-bone-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
      }
    >
      {label}
    </Link>
  );
}

function ArchiveCard({ row }: { row: WagArchiveRow }) {
  const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  // Same R2-vs-proxy fallback as wag-rotation. Inline here so the
  // archive page doesn't pull in a server-only db helper.
  const imageRenderUrl =
    row.imageR2Key && r2Base
      ? `${r2Base.replace(/\/+$/, "")}/${row.imageR2Key}`
      : `/api/sports/wag/image?wagId=${encodeURIComponent(row.id)}`;
  return (
    <li>
      <Link
        href={`/sports/wags/${row.slug}`}
        className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
      >
        <article className="relative aspect-[4/5] overflow-hidden rounded-sm bg-bone-100 ring-1 ring-bone-200">
          <Image
            src={imageRenderUrl}
            alt={`${row.name}, partner of ${row.athleteName}`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bone-50/95 via-bone-50/60 to-transparent p-3">
            <p className="font-display text-base font-semibold text-balance text-bone-950">
              {row.name}
            </p>
            <p className="text-[11px] uppercase tracking-widest text-bone-700">
              {row.sport} · {row.athleteName}
            </p>
          </div>
          {row.featureCount > 0 ? (
            <span className="absolute right-2 top-2 rounded-full bg-bone-950/80 px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.2em] tabular-nums text-bone-50">
              {row.featureCount}×
            </span>
          ) : null}
        </article>
        {row.instagramHandle ? (
          <p className="mt-2 truncate text-xs text-bone-700">
            <InstagramLink handle={row.instagramHandle} tone="muted" />
          </p>
        ) : null}
      </Link>
    </li>
  );
}
