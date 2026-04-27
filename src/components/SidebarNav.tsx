"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEM, MAIN_NAV_ITEMS, type NavItem } from "@/lib/nav";

// Imports of MAIN_NAV_ITEMS / ADMIN_NAV_ITEM live inside this client
// component on purpose: those arrays carry Tabler icon component refs
// (functions), which cannot cross the RSC server→client boundary as
// props. The parent Server Component picks a slot via string and the
// items resolve here, in client land. Don't refactor this back into
// "pass items as a prop from the server" — production breaks.
type Slot = "main" | "admin";

const ITEMS_BY_SLOT: Record<Slot, readonly NavItem[]> = {
  main: MAIN_NAV_ITEMS,
  admin: [ADMIN_NAV_ITEM],
};

const ARIA_LABEL_BY_SLOT: Record<Slot, string> = {
  main: "Portal navigation",
  admin: "Admin navigation",
};

type SidebarNavProps = {
  slot: Slot;
};

export function SidebarNav({ slot }: SidebarNavProps) {
  const pathname = usePathname();
  const items = ITEMS_BY_SLOT[slot];
  const ariaLabel = ARIA_LABEL_BY_SLOT[slot];

  return (
    <nav aria-label={ariaLabel} className="space-y-0.5 px-3 py-2 group-data-[collapsed]:px-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group/item relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              "group-data-[collapsed]:justify-center group-data-[collapsed]:px-0 group-data-[collapsed]:py-2",
              slot === "admin"
                ? active
                  ? "border border-bone-50 bg-bone-50 text-bone-950"
                  : "border border-bone-700 text-bone-300 hover:border-bone-500 hover:bg-bone-800/40 hover:text-bone-50"
                : active
                  ? "bg-claude-500/10 text-bone-50"
                  : "text-bone-300 hover:bg-bone-800/60 hover:text-bone-50",
            )}
          >
            {active && slot !== "admin" ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-claude-400 group-data-[collapsed]:inset-y-auto group-data-[collapsed]:inset-x-1.5 group-data-[collapsed]:bottom-0 group-data-[collapsed]:h-0.5 group-data-[collapsed]:w-auto group-data-[collapsed]:rounded-t group-data-[collapsed]:rounded-r-none"
              />
            ) : null}
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="flex-1 group-data-[collapsed]:hidden">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
