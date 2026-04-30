import Image from "next/image";
import Link from "next/link";
import type { WagOfTheDay as WagOfTheDayData } from "@/lib/sports/wag-rotation";
import { InstagramLink } from "@/components/social/InstagramLink";

/// Editorial cover tile for today's WAG. Full-bleed image inside its
/// grid column on desktop (cols 1-7); 4:5 aspect on mobile. Name lockup
/// and caption pinned bottom-left with a soft gradient overlay.
///
/// Empty state when nothing is scheduled: "On break today." Admin-
/// visible variant adds a CTA link to the queue UI (queue admin ships
/// in the next commit). Mirrors mockups/sports-desktop.html.
///
/// Per the rams a11y pass: real <article> + <h2 className="sr-only">,
/// image carries a descriptive alt (not decorative alt="").
export function WagOfTheDay({
  data,
  isAdmin,
  /// Sequence number shown in the top-right callsign. The plan calls
  /// for this to be derived from "how many WAG features have been
  /// published"; until that count exists in a follow-up admin page,
  /// callers can pass a static number or leave undefined to omit.
  serial,
}: {
  data: WagOfTheDayData | null;
  isAdmin: boolean;
  serial?: number;
}) {
  if (!data) {
    return (
      <article className="relative col-span-1 overflow-hidden rounded-sm bg-bone-100 ring-1 ring-bone-200 md:col-span-7">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #EFECDF 0%, #FAF9F5 60%, #FAF9F5 100%)",
          }}
        />
        <SectionHeaderEyebrow label="WAG of the Day" />
        <div className="relative flex aspect-[4/5] flex-col justify-end p-6 md:aspect-[7/8] md:p-10">
          <h2 className="sr-only">WAG of the Day</h2>
          <p className="font-display text-2xl font-semibold text-bone-700 md:text-3xl">
            On break today.
          </p>
          {isAdmin ? (
            <Link
              href="/admin/sports/wags/queue"
              className="mt-3 inline-flex w-fit items-center gap-2 rounded-full border border-bone-300 bg-bone-50 px-3 py-1.5 text-xs text-bone-800 transition-colors hover:border-claude-500 hover:text-claude-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Schedule one →
            </Link>
          ) : null}
        </div>
      </article>
    );
  }

  const { wag, caption } = data;
  const altText = `${wag.name}, partner of ${wag.athleteName}`;

  return (
    <article className="relative col-span-1 aspect-[4/5] overflow-hidden rounded-sm bg-bone-100 ring-1 ring-bone-200 md:col-span-7 md:aspect-[7/8]">
      {/* Same-origin image proxy: /api/sports/wag/image fetches the
          remote bytes server-side (cross-origin hotlink blockers,
          referrer policies, CORS — all handled there). next/image is
          happy because the URL it sees is same-origin, no
          remotePatterns extension needed. */}
      <Image
        src={`/api/sports/wag/image?wagId=${encodeURIComponent(wag.id)}`}
        alt={altText}
        fill
        priority
        sizes="(max-width: 768px) 100vw, 60vw"
        className="object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 mix-blend-overlay opacity-[0.20]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.4) 0.5px, transparent 0.5px)",
          backgroundSize: "3px 3px",
        }}
      />
      <SectionHeaderEyebrow
        label="WAG of the Day"
        serial={serial}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bone-50/95 via-bone-50/60 to-transparent p-6 md:p-10">
        <h2
          className="font-display font-semibold text-balance text-bone-950"
          style={{
            fontSize: "clamp(32px, 4.5vw, 64px)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 0.95,
          }}
        >
          {wag.name}
        </h2>
        {caption ? (
          <p className="mt-2 max-w-xl text-sm text-pretty text-bone-800 line-clamp-1 md:mt-3 md:line-clamp-2 md:text-lg">
            {caption}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs md:mt-5 md:text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bone-100 px-3 py-1 text-bone-900 ring-1 ring-bone-300">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600">
              Athlete
            </span>
            <span className="truncate">
              {wag.athleteName}
              {wag.team ? ` · ${wag.team}` : ""}
            </span>
          </span>
          <InstagramLink handle={wag.instagramHandle} />
        </div>
      </div>
    </article>
  );
}

/// Top-corner callsign pinned absolute over the cover tile. Pulled out
/// because both the populated and empty states share it.
function SectionHeaderEyebrow({
  label,
  serial,
}: {
  label: string;
  serial?: number;
}) {
  return (
    <div className="absolute inset-x-6 top-6 z-10 flex items-center justify-between md:inset-x-10 md:top-10">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-700">
        {label}
      </span>
      {typeof serial === "number" ? (
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] tabular-nums text-bone-700">
          № {String(serial).padStart(3, "0")}
        </span>
      ) : null}
    </div>
  );
}
