"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";

type SidebarNavProps = {
  items: readonly NavItem[];
};

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Portal navigation" className="space-y-0.5 px-3 py-2 group-data-[collapsed]:px-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
              active
                ? "bg-claude-500/10 text-bone-50"
                : "text-bone-300 hover:bg-bone-800/60 hover:text-bone-50",
            )}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-claude-400 group-data-[collapsed]:inset-y-auto group-data-[collapsed]:inset-x-1.5 group-data-[collapsed]:bottom-0 group-data-[collapsed]:h-0.5 group-data-[collapsed]:w-auto group-data-[collapsed]:rounded-t group-data-[collapsed]:rounded-r-none"
              />
            ) : null}
            <span aria-hidden="true" className="text-base leading-none">
              {item.icon}
            </span>
            <span className="flex-1 group-data-[collapsed]:hidden">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
