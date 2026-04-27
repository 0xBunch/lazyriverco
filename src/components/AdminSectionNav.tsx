"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminSectionNavItem = {
  readonly href: string;
  readonly label: string;
};

// Inner sub-navigation that renders inside an admin umbrella section
// (Agents / Memory / Ops / Sports). Visually subordinate to AdminSubNav:
// no border-tab look, lighter weight, smaller text, so the hierarchy
// reads "section > subsection" at a glance. Reuses bone-* + claude-*
// palette and focus-visible ring style for consistency.
export function AdminSectionNav({
  items,
}: {
  items: readonly AdminSectionNavItem[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Section sub-navigation"
      className="flex flex-wrap gap-1"
    >
      {items.map((item) => {
        const active =
          pathname === item.href ||
          pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.15em] transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
              // Active uses claude-* tint, not another step on the bone-*
              // gray ladder, so it lives in a different visual register
              // than AdminSubNav's active tab (bg-bone-900). Both navs
              // active simultaneously read as section vs. subsection
              // instead of two-shades-of-gray.
              active
                ? "bg-claude-500/10 text-claude-100"
                : "text-bone-300 hover:bg-bone-900 hover:text-bone-50",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
