import Link from "next/link";
import { cn } from "@/lib/utils";

export type ChatsView = "active" | "starred" | "archived";

const TABS: ReadonlyArray<{ key: ChatsView; label: string }> = [
  { key: "active", label: "Active" },
  { key: "starred", label: "Starred" },
  { key: "archived", label: "Archived" },
];

type Props = {
  active: ChatsView;
  searchParams: Readonly<Record<string, string | undefined>>;
};

// Server component — three view tabs that drive ?view=. Switching views
// drops ?page= so the user always lands on page 1 of the new view.
export function ChatsViewTabs({ active, searchParams }: Props) {
  function hrefFor(view: ChatsView): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== "view" && k !== "page") params.set(k, v);
    }
    if (view !== "active") params.set("view", view);
    const qs = params.toString();
    return qs ? `/chats?${qs}` : "/chats";
  }

  return (
    <div
      role="tablist"
      aria-label="Conversation view"
      className="flex items-center gap-1 border-b border-bone-800/60"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400",
              isActive
                ? "border-claude-400 text-bone-50"
                : "border-transparent text-bone-400 hover:text-bone-200",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
