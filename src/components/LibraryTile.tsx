import Link from "next/link";
import type { $Enums } from "@prisma/client";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/initials";

// Library tile — uniform aspect-square regardless of source, per the
// design-oracle call: coherence with the calendar grid > media-appropriate
// layout variance. Origin is communicated through treatment (play glyph
// for video, bleeding photo for IG, typographic field for Tier-C web
// links), NOT through favicon badges.
//
// Always-visible uploader avatar (bottom-left, 20 px, no chrome) because
// in a 7-person shared archive the attribution is half the joke and
// hover-reveal hides the content.

export type LibraryTileItem = {
  id: string;
  url: string;
  ogImageUrl: string | null;
  // Single source of truth — aligned with the Prisma enum so a new
  // MediaOrigin value (e.g. TIKTOK, if we ever add it) flags every
  // downstream switch that forgot a case.
  origin: $Enums.MediaOrigin;
  /** Legacy free-string type column: "image"|"youtube"|"tweet"|"instagram"|"link"|"other". */
  type: string;
  caption: string | null;
  sourceUrl: string | null;
  originTitle: string | null;
  originAuthor: string | null;
  hallOfFame: boolean;
  createdAt: Date;
  uploadedBy: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    name: string;
  };
};

type Props = {
  item: LibraryTileItem;
  /** Featured tiles in the Hall-of-Fame hero row get a subtle accent ring. */
  featured?: boolean;
};

export function LibraryTile({ item, featured }: Props) {
  const href = `/library/${item.id}`;
  const isVideo = item.origin === "YOUTUBE";
  const isWebLink = item.type === "link"; // Tier-C: no OG image found
  const displayImage = item.url || item.ogImageUrl;

  return (
    <Link
      href={href}
      className={cn(
        "group relative block aspect-square overflow-hidden rounded-md bg-bone-900",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
        "transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none",
        featured && "ring-1 ring-claude-500/50",
      )}
      aria-label={ariaLabel(item)}
    >
      {isWebLink ? (
        <TypographicTile item={item} />
      ) : displayImage ? (
        /* Plain img (not next/image) so remote OG hosts don't need to be
           allowlisted in next.config — the library accepts any domain. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayImage}
          alt={item.caption ?? item.originTitle ?? "Shared media"}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-bone-500">—</div>
      )}

      {/* YouTube: centered play glyph over a darkening wash. */}
      {isVideo ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/10 to-black/30">
          <div className="rounded-full bg-black/60 p-3 backdrop-blur-sm">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-bone-50" aria-hidden>
              <path d="M5.5 3.5v13l11-6.5-11-6.5z" />
            </svg>
          </div>
        </div>
      ) : null}

      {/* Uploader avatar — always visible, bottom-left. */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2">
        <Avatar user={item.uploadedBy} />
        {featured ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-claude-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            HoF
          </span>
        ) : null}
      </div>

      {/* Hover/focus caption strip — quiet, optional. Only render when we
          have a caption, otherwise leave the photo untouched. */}
      {item.caption ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-xs text-bone-100 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
          <p className="line-clamp-2 text-pretty">{item.caption}</p>
        </div>
      ) : null}
    </Link>
  );
}

function ariaLabel(item: LibraryTileItem): string {
  const parts: string[] = [];
  const mediaKind = item.origin === "YOUTUBE" ? "video" : "photo";
  if (item.caption) parts.push(`${mediaKind}: ${item.caption}`);
  else if (item.originTitle) parts.push(`${mediaKind}: ${item.originTitle}`);
  else parts.push(`Shared ${mediaKind}`);
  parts.push(`by ${item.uploadedBy.displayName}`);
  if (item.origin !== "UPLOAD") parts.push(`on ${originWord(item.origin)}`);
  if (item.hallOfFame) parts.push("(Hall of Fame)");
  return parts.join(", ");
}

function originWord(o: $Enums.MediaOrigin): string {
  switch (o) {
    case "YOUTUBE":
      return "YouTube";
    case "INSTAGRAM":
      return "Instagram";
    case "X":
      return "X";
    case "WEB":
      return "the web";
    case "UPLOAD":
      return "Lazy River";
  }
}

function Avatar({ user }: { user: LibraryTileItem["uploadedBy"] }) {
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className="h-5 w-5 rounded-full object-cover ring-1 ring-black/40"
      />
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bone-800 text-[9px] font-semibold text-bone-200 ring-1 ring-black/40">
      {initialsOf(user.displayName)}
    </span>
  );
}

// Typographic "Tier-C" tile: raw web links with no OG image. Treats the
// absence of an image as a feature — display type on a muted field with
// the host and title up front.
function TypographicTile({ item }: { item: LibraryTileItem }) {
  let host = "";
  try {
    host = item.sourceUrl ? new URL(item.sourceUrl).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  return (
    <div className="flex h-full w-full flex-col justify-between bg-bone-900/80 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-claude-300">{host || "Link"}</p>
      <p className="font-display text-lg font-semibold leading-snug text-bone-100 text-balance line-clamp-4">
        {item.originTitle ?? item.caption ?? item.sourceUrl}
      </p>
    </div>
  );
}
