import type { SportsSponsor } from "@prisma/client";

/// Mid-page broadcast-break sponsor rail. Full-bleed (no max-width
/// constraint), sits between the WAG/MLF row and the
/// HEADLINES/HIGHLIGHTS row on the /sports landing.
///
/// Two render modes:
///  - `imageR2Key` + `imageShape` set → image-only banner. BILLBOARD =
///    full-width strip at ~970×250; SQUARE = centered tile at ~480×480.
///    Wraps in an <a> when `href` is set; the destination hostname is
///    surfaced under the image for click-through transparency.
///  - No image → existing text-rendered sponsor card with name,
///    tagline, rotation dots, and Visit button.
///
/// Renders nothing when there's no active sponsor.
const R2_PUBLIC_BASE =
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";

function r2Url(key: string): string | null {
  if (!R2_PUBLIC_BASE) return null;
  return `${R2_PUBLIC_BASE}/${key}`;
}

function safeHostname(href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

type SponsorBreakProps = {
  sponsor: Pick<
    SportsSponsor,
    "name" | "tagline" | "href" | "imageR2Key" | "imageAltText" | "imageShape"
  > | null;
  /// Total active sponsors. Used to render the rotation dot count;
  /// minimum 1 to render the rail at all.
  totalActive: number;
  /// 0-based index of `sponsor` within the active set. Drives which
  /// dot is highlighted.
  activeIndex: number;
};

export function SponsorBreakRail({
  sponsor,
  totalActive,
  activeIndex,
}: SponsorBreakProps) {
  if (!sponsor || totalActive <= 0) return null;

  const dotCount = Math.max(totalActive, 1);
  const safeIndex = Math.max(0, Math.min(activeIndex, dotCount - 1));
  const hasImage = !!sponsor.imageR2Key && !!sponsor.imageShape;

  if (hasImage) {
    return (
      <BannerMode
        sponsor={sponsor}
        dotCount={dotCount}
        safeIndex={safeIndex}
      />
    );
  }

  return (
    <TextMode sponsor={sponsor} dotCount={dotCount} safeIndex={safeIndex} />
  );
}

// ---------------------------------------------------------------------------
// Banner (image) mode

function BannerMode({
  sponsor,
  dotCount,
  safeIndex,
}: {
  sponsor: NonNullable<SponsorBreakProps["sponsor"]>;
  dotCount: number;
  safeIndex: number;
}) {
  const imageUrl = sponsor.imageR2Key ? r2Url(sponsor.imageR2Key) : null;
  if (!imageUrl) {
    // R2 not configured — fall back to text mode rather than rendering
    // a broken <img>.
    return (
      <TextMode sponsor={sponsor} dotCount={dotCount} safeIndex={safeIndex} />
    );
  }

  const altText = sponsor.imageAltText ?? sponsor.name;
  const isSquare = sponsor.imageShape === "SQUARE";
  const hostname = safeHostname(sponsor.href);

  const imageWrapperClass = isSquare
    ? "mx-auto block aspect-square w-full max-w-[480px] overflow-hidden rounded-lg ring-1 ring-bone-200"
    : "mx-auto block aspect-[970/250] w-full max-w-5xl overflow-hidden rounded-lg ring-1 ring-bone-200";

  // R2 hostnames aren't yet allowlisted in next.config remotePatterns;
  // the partner-photo proxy + sponsor banners both ship as raw <img>.
  const figure = (
    <span className={imageWrapperClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={altText}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </span>
  );

  return (
    <section
      aria-label={`Sponsor break: ${sponsor.name}`}
      className="relative w-full border-y border-bone-200 bg-bone-100"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-4 px-4 py-8 md:px-6 md:py-10 lg:px-10">
        {sponsor.href ? (
          <a
            href={sponsor.href}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
          >
            {figure}
          </a>
        ) : (
          figure
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-600">
            {sponsor.name}
          </span>
          {hostname ? (
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-500">
              <span aria-hidden="true" className="mr-2">
                ·
              </span>
              {hostname}
              <span aria-hidden="true" className="ml-1">
                ↗
              </span>
            </span>
          ) : null}
          <span aria-hidden="true" className="text-bone-300">
            ·
          </span>
          <RotationDots dotCount={dotCount} safeIndex={safeIndex} />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Text mode (existing behavior, unchanged)

function TextMode({
  sponsor,
  dotCount,
  safeIndex,
}: {
  sponsor: NonNullable<SponsorBreakProps["sponsor"]>;
  dotCount: number;
  safeIndex: number;
}) {
  return (
    <section
      aria-label="Sponsor break"
      className="relative w-full border-y border-sports-amber/40 bg-bone-100"
    >
      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-4 px-4 py-6 md:grid-cols-12 md:gap-6 md:px-6 md:py-8 lg:gap-10 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-2 md:col-span-7">
          <div className="flex items-center gap-2">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-700">
              Lazy River Sports
            </span>
            <span aria-hidden="true" className="text-bone-300">
              ·
            </span>
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-700">
              Brought to you by
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-2 md:gap-4">
            <span
              className="font-display font-bold uppercase text-bone-950"
              style={{
                fontSize: "clamp(28px, 3.6vw, 48px)",
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}
            >
              {sponsor.name}
            </span>
            {sponsor.tagline ? (
              <span className="text-sm italic text-bone-700 md:text-base">
                &ldquo;{sponsor.tagline}&rdquo;
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 md:col-span-5 md:justify-end md:gap-5">
          <div className="flex items-center gap-3">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-500">
              Rotation
            </span>
            <RotationDots dotCount={dotCount} safeIndex={safeIndex} />
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] tabular-nums text-bone-600">
              {String(safeIndex + 1).padStart(2, "0")} / {String(dotCount).padStart(2, "0")}
            </span>
          </div>
          {sponsor.href ? (
            <a
              href={sponsor.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-bone-300 bg-bone-50 px-4 py-2 text-xs uppercase tracking-widest text-bone-900 transition-colors hover:border-bone-500 hover:bg-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              Visit
              <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function RotationDots({
  dotCount,
  safeIndex,
}: {
  dotCount: number;
  safeIndex: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={`Sponsor ${safeIndex + 1} of ${dotCount}`}
    >
      {Array.from({ length: dotCount }).map((_, i) => (
        <span
          key={i}
          className={
            i === safeIndex
              ? "h-1.5 w-3 rounded-full bg-sports-amber"
              : "h-1.5 w-1.5 rounded-full bg-bone-300"
          }
        />
      ))}
    </span>
  );
}
