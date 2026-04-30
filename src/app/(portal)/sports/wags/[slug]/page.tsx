import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getWagProfile } from "@/lib/sports/wag-archive";
import { InstagramLink } from "@/components/social/InstagramLink";

export const dynamic = "force-dynamic";

// /sports/wags/[slug] — per-WAG profile page. Hero image, full
// bio fields, athlete cross-link, and the history of every featureDate
// the WAG has been scheduled for. The differentiator surface — this
// is what makes "robust WAG data" land for a visitor.
//
// Slug shape: <slugify(name)>-<8-char-id-prefix>. See wag-archive.ts.

type Params = { slug: string };

export default async function WagProfilePage({
  params,
}: {
  params: Params;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/start");

  const profile = await getWagProfile(params.slug);
  if (!profile) notFound();

  const { wag, imageRenderUrl, features, athleteSleeperPlayerId } = profile;
  const featureCount = features.length;
  const lastFeatured = features[0]?.featureDate ?? null;
  const sourceHost = wag.sourceUrl ? safeHost(wag.sourceUrl) : null;

  return (
    <article className="mx-auto max-w-4xl px-4 py-8 pt-20 md:pt-8">
      <nav className="mb-4 text-sm text-bone-600">
        <Link
          href="/sports/wags"
          className="inline-flex items-center gap-1 rounded px-1 hover:text-bone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
        >
          <span aria-hidden="true">←</span> WAG archive
        </Link>
      </nav>

      <div className="grid gap-6 md:grid-cols-[2fr,3fr] md:gap-8">
        {/* Hero — same R2-vs-proxy resolution wag-rotation uses. */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-bone-100 ring-1 ring-bone-200">
          <Image
            src={imageRenderUrl}
            alt={`${wag.name}, partner of ${wag.athleteName}`}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 40vw"
            className="object-cover"
          />
        </div>

        <div className="flex flex-col gap-4">
          <header>
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-bone-600">
              {wag.sport} · {wag.team ?? "Team unknown"}
            </p>
            <h1
              className="mt-2 font-display font-semibold text-balance text-bone-950"
              style={{
                fontSize: "clamp(28px, 4vw, 56px)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 0.97,
              }}
            >
              {wag.name}
            </h1>
            <p className="mt-2 text-base text-bone-700">
              Partner of{" "}
              {athleteSleeperPlayerId ? (
                <Link
                  href={`/sports/mlf/players/${athleteSleeperPlayerId}`}
                  className="font-medium text-bone-950 underline decoration-bone-400 underline-offset-4 hover:decoration-bone-700"
                >
                  {wag.athleteName}
                </Link>
              ) : (
                <span className="font-medium text-bone-950">
                  {wag.athleteName}
                </span>
              )}
            </p>
          </header>

          {wag.notableFact ? (
            <p className="text-base text-bone-800 text-pretty md:text-lg">
              {wag.notableFact}
            </p>
          ) : null}
          {wag.caption && wag.caption !== wag.notableFact ? (
            <p className="border-l-2 border-bone-300 pl-3 text-sm italic text-bone-700">
              &ldquo;{wag.caption}&rdquo;
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-sm border border-bone-200 bg-bone-50 p-4 text-sm">
            <Stat label="Times featured">{featureCount}</Stat>
            <Stat label="Last featured">
              {lastFeatured ? formatDate(lastFeatured) : "—"}
            </Stat>
            {wag.checkedAt ? (
              <Stat label="AI-verified">{formatDate(wag.checkedAt)}</Stat>
            ) : null}
            <Stat label="Confidence">
              <span
                className={
                  wag.confidence === "low"
                    ? "italic text-bone-700"
                    : "font-medium text-bone-950"
                }
              >
                {wag.confidence}
              </span>
            </Stat>
          </dl>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {wag.instagramHandle ? (
              <InstagramLink handle={wag.instagramHandle} />
            ) : null}
            {wag.sourceUrl && sourceHost ? (
              <a
                href={wag.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-bone-700 underline decoration-bone-400 underline-offset-4 transition-colors hover:text-bone-900"
              >
                source · {sourceHost}
              </a>
            ) : null}
            {user.role === "ADMIN" ? (
              <Link
                href={`/admin/sports/wags?edit=${wag.id}`}
                className="ml-auto rounded-md border border-bone-300 bg-bone-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-bone-700 transition-colors hover:border-claude-500 hover:text-claude-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
              >
                Edit in admin
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {features.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-bone-700">
            Feature history
          </h2>
          <ul className="mt-3 divide-y divide-bone-200 rounded-sm border border-bone-200 bg-bone-50">
            {features.map((f) => (
              <li
                key={`${f.featureDate.toISOString()}`}
                className="flex flex-wrap items-baseline gap-3 px-4 py-3 text-sm"
              >
                <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] tabular-nums text-bone-700">
                  {formatDate(f.featureDate)}
                </span>
                {f.caption ? (
                  <span className="text-bone-800 italic">{f.caption}</span>
                ) : (
                  <span className="text-bone-500">no caption override</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-bone-600">
        {label}
      </dt>
      <dd className="mt-0.5 text-bone-950">{children}</dd>
    </div>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
