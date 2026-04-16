"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type SidebarShellProps = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

const COLLAPSED_KEY = "lr-sidebar-collapsed";

export function SidebarShell({ sidebar, children }: SidebarShellProps) {
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  // Hydrate collapsed state from localStorage after mount
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // SSR or localStorage unavailable — default to expanded
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // Close mobile drawer on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const drawerHidden = isMobile && !open;

  return (
    <div className="flex min-h-screen">
      {/* Mobile hamburger — visible < md OR when desktop sidebar is collapsed */}
      <button
        type="button"
        onClick={() => (isMobile ? setOpen(true) : toggleCollapsed())}
        aria-label={collapsed ? "Open sidebar" : "Open navigation"}
        aria-expanded={isMobile ? open : !collapsed}
        aria-controls="portal-sidebar"
        className={cn(
          "fixed left-4 top-4 z-40 rounded-lg border border-bone-700 bg-bone-800/80 p-2 text-bone-100 backdrop-blur transition-all hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500",
          // Mobile: always show. Desktop: only show when collapsed.
          isMobile ? "" : collapsed ? "md:block" : "md:hidden",
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile backdrop */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-bone-950/80 backdrop-blur-sm md:hidden"
        />
      ) : null}

      {/* Sidebar */}
      <aside
        id="portal-sidebar"
        aria-label="Primary navigation"
        aria-hidden={drawerHidden ? "true" : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-bone-700 bg-bone-900 transition-transform duration-200 ease-out",
          // Mobile: slide from left
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: when expanded, sticky (takes flow space). When
          // collapsed, stays fixed + slides fully off-screen so main
          // content gets full width.
          collapsed
            ? "md:fixed md:-translate-x-full"
            : "md:sticky md:top-0 md:h-screen md:translate-x-0",
        )}
      >
        {/* Desktop collapse button — inside the sidebar at the top */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar"
          className="absolute right-2 top-6 z-10 hidden rounded-md p-1 text-bone-400 transition-colors hover:bg-bone-800 hover:text-bone-200 md:block"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 19l-7-7 7-7" />
            <path d="M18 19l-7-7 7-7" />
          </svg>
        </button>

        {sidebar}
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
