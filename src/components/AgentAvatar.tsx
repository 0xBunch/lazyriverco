import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/initials";

// Shared avatar for agents (Character entities). Renders the uploaded
// headshot when avatarUrl is set; otherwise a two-letter initials circle.
// One place to evolve — the four+ render sites (sidebar row, chat header,
// message bubble, gallery thread) should not re-implement this fallback.
//
// The prop shape is structurally compatible with both `Character`
// (prisma) and `message.author` when authorType === "CHARACTER" — both
// expose { displayName, avatarUrl }. Intentionally scoped to character
// rendering; user avatars have their own site-specific look and are out
// of scope for this component.

type Size = "xs" | "sm" | "md" | "lg";
type Tone = "neutral" | "accent";

type Props = {
  character: { displayName: string; avatarUrl: string | null };
  size?: Size;
  tone?: Tone;
  className?: string;
};

const SIZE_CLASSES: Record<Size, string> = {
  xs: "h-5 w-5 text-[8px]",
  sm: "h-6 w-6 text-[9px]",
  md: "h-8 w-8 text-[10px]",
  lg: "h-9 w-9 text-xs",
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-bone-800 text-bone-200",
  accent: "bg-claude-500/25 text-claude-100",
};

export function AgentAvatar({
  character,
  size = "md",
  tone = "neutral",
  className,
}: Props) {
  const sizeClass = SIZE_CLASSES[size];

  if (character.avatarUrl) {
    return (
      // Matches the pattern used elsewhere in the app (ChatsRow, gallery
      // thread) — deliberate <img> because Character avatars are small,
      // already CDN-served from gallery.lazyriver.co, and next/image's
      // optimizer adds overhead we don't need at this scale.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={character.avatarUrl}
        alt=""
        className={cn(
          sizeClass,
          "shrink-0 rounded-full object-cover ring-1 ring-black/40",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        sizeClass,
        "flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-black/40",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {initialsOf(character.displayName)}
    </span>
  );
}
