import Link from "next/link";
import { cn } from "@/lib/utils";

// ?v=-driven calendar view toggle. When active === null, neither tab
// highlights — a viewport-dependent highlight would mean the same URL
// renders two tab states. First tap commits the choice to the URL.

export type CalendarView = "calendar" | "list";

const TABS: ReadonlyArray<{ key: CalendarView; label: string }> = [
  { key: "calendar", label: "Calendar" },
  { key: "list", label: "List" },
];

type Props = {
  /** Explicit selection from ?v=; null when unset (viewport decides). */
  active: CalendarView | null;
  searchParams: Readonly<Record<string, string | undefined>>;
};

export function CalendarViewTabs({ active, searchParams }: Props) {
  function hrefFor(view: CalendarView): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (!v || k === "v") continue;
      // ?m= only applies to the calendar view — drop it when linking to list
      // so we don't carry a meaningless month into the list URL.
      if (view === "list" && k === "m") continue;
      params.set(k, v);
    }
    params.set("v", view);
    return `/calendar?${params.toString()}`;
  }

  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="flex items-center gap-1 border-b border-bone-800/60"
    >
      {TABS.map((tab) => {
        const isSelected = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            role="tab"
            aria-selected={isSelected}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400",
              isSelected
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
