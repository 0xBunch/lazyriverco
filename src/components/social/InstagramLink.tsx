import { instagramHandleUrl } from "@/lib/social/instagram";

/// Shared @handle link rendered on both the /sports WAG of the Day cover
/// and the WAGFINDER partner card on /sports/mlf player profiles. Pass
/// the raw handle (no @, no URL); the helper sanitizes and renders.
/// `tone` controls the underline accent so the same component fits both
/// the dark profile card and the bone-toned editorial cover.
export function InstagramLink({
  handle,
  tone = "claude",
  className,
}: {
  handle: string | null | undefined;
  tone?: "claude" | "muted";
  className?: string;
}) {
  const href = instagramHandleUrl(handle);
  if (!href || !handle) return null;
  const sanitizedHandle = href.replace(/^https:\/\/instagram\.com\//, "");
  const accent =
    tone === "claude"
      ? "text-claude-700 underline decoration-claude-700 underline-offset-4 transition-colors hover:text-claude-800 focus-visible:ring-2 focus-visible:ring-claude-500"
      : "text-bone-700 underline decoration-bone-400 underline-offset-4 transition-colors hover:text-bone-900 focus-visible:ring-2 focus-visible:ring-bone-400";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "focus:outline-none",
        accent,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      @{sanitizedHandle}
    </a>
  );
}
