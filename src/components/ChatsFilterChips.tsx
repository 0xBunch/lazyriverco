import Link from "next/link";
import { cn } from "@/lib/utils";

type Character = {
  id: string;
  displayName: string;
};

type Props = {
  characters: readonly Character[];
  activeCharacterId: string | null;
  // The current page's search params, pre-stringified, so chip clicks
  // preserve every other filter (q, view) while toggling character.
  searchParams: Readonly<Record<string, string | undefined>>;
};

// Server component — chips are plain links that drive ?character=.
// "All" clears the param entirely.
export function ChatsFilterChips({
  characters,
  activeCharacterId,
  searchParams,
}: Props) {
  function hrefFor(charId: string | null): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      // Drop pagination on filter change — different filter, fresh page 1.
      if (v && k !== "character" && k !== "page") params.set(k, v);
    }
    if (charId) params.set("character", charId);
    const qs = params.toString();
    return qs ? `/chats?${qs}` : "/chats";
  }

  if (characters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by character">
      <Chip
        href={hrefFor(null)}
        active={activeCharacterId === null}
        label="All"
      />
      {characters.map((c) => (
        <Chip
          key={c.id}
          href={hrefFor(c.id)}
          active={activeCharacterId === c.id}
          label={c.displayName}
        />
      ))}
    </div>
  );
}

function Chip({
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
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400",
        active
          ? "border-claude-500/40 bg-claude-500/20 text-claude-100"
          : "border-bone-800/60 bg-bone-900/40 text-bone-300 hover:text-bone-100",
      )}
      aria-pressed={active}
    >
      {label}
    </Link>
  );
}
