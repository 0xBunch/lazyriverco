import Link from "next/link";
import { initialsOf } from "@/lib/initials";
import { relativeShort } from "@/lib/date-buckets";
import { ChatsRowMenu } from "./ChatsRowMenu";

export type ChatsRowItem = {
  id: string;
  title: string | null;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  isStarred: boolean;
  isArchived: boolean;
  character: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export function ChatsRow({ row }: { row: ChatsRowItem }) {
  const title = row.title?.trim() || "Untitled chat";
  return (
    <li className="group relative">
      <Link
        href={`/chat/${row.id}`}
        className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-bone-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      >
        <CharacterAvatar character={row.character} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {row.isStarred ? (
              <span aria-label="Starred" className="text-xs text-claude-300">
                ★
              </span>
            ) : null}
            <p className="truncate text-sm font-medium text-bone-100 text-pretty">
              {title}
            </p>
          </div>
          {row.lastMessagePreview ? (
            <p className="line-clamp-1 text-xs text-bone-400">
              {row.lastMessagePreview}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-bone-500">
          {relativeShort(row.lastMessageAt)}
        </span>
      </Link>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <ChatsRowMenu
          conversationId={row.id}
          currentTitle={title}
          isStarred={row.isStarred}
          isArchived={row.isArchived}
        />
      </div>
    </li>
  );
}

function CharacterAvatar({
  character,
}: {
  character: ChatsRowItem["character"];
}) {
  if (character.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={character.avatarUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/40"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bone-800 text-[10px] font-semibold text-bone-200 ring-1 ring-black/40"
    >
      {initialsOf(character.displayName)}
    </span>
  );
}
