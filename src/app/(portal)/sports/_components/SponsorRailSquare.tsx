import type { SportsSponsor } from "@prisma/client";

/// Square-only sponsor card sized for the /sports right rail. Replaces
/// the retired full-bleed mid-page <SponsorBreakRail>. One small
/// "Sponsor · {name}" label above a 1:1 tile — minimum signal that
/// this is a placement, no broadcast-break theatrics. Renders nothing
/// without an image: text-only sponsors are deprecated.
const R2_PUBLIC_BASE =
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";

function r2Url(key: string): string | null {
  if (!R2_PUBLIC_BASE) return null;
  return `${R2_PUBLIC_BASE}/${key}`;
}

type Props = {
  sponsor: Pick<
    SportsSponsor,
    "name" | "href" | "imageR2Key" | "imageAltText" | "imageShape"
  > | null;
};

export function SponsorRailSquare({ sponsor }: Props) {
  if (!sponsor || !sponsor.imageR2Key || sponsor.imageShape !== "SQUARE") {
    return null;
  }
  const imageUrl = r2Url(sponsor.imageR2Key);
  if (!imageUrl) return null;

  const altText = sponsor.imageAltText ?? sponsor.name;

  const figure = (
    <span className="block aspect-square w-full overflow-hidden rounded-lg ring-1 ring-bone-200">
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
    <section aria-label={`Sponsor: ${sponsor.name}`} className="flex flex-col gap-2">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-500">
        Sponsor · {sponsor.name}
      </span>
      {sponsor.href ? (
        <a
          href={sponsor.href}
          target="_blank"
          rel="noopener noreferrer"
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
        >
          {figure}
        </a>
      ) : (
        figure
      )}
    </section>
  );
}
