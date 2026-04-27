"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ADMIN_TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/ai", label: "AI" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/memory", label: "Memory" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/sports", label: "Sports" },
] as const;

export function AdminSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="flex flex-wrap gap-1 border-b border-bone-700"
    >
      {ADMIN_TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href !== "/admin" && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              active
                ? "border-bone-700 bg-bone-900 text-bone-50"
                : "border-transparent text-bone-300 hover:text-bone-50",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
