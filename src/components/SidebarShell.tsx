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
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {}
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
      {/* Mobile hamburger — only visible < md */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="portal-sidebar"
        className="fixed left-4 top-4 z-40 rounded-lg border border-bone-700 bg-bone-800/80 p-2 text-bone-100 backdrop-blur transition-all hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 md:hidden"
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

      {/* Sidebar — desktop: sticky with icon-rail collapse.
          The `group` class + `data-collapsed` attribute lets child
          components use `group-data-[collapsed]:` Tailwind variants
          to toggle between full and icon-only modes without prop drilling
          into the server-rendered Sidebar component. */}
      <aside
        id="portal-sidebar"
        aria-label="Primary navigation"
        aria-hidden={drawerHidden ? "true" : undefined}
        data-collapsed={collapsed ? "" : undefined}
        className={cn(
          "group fixed inset-y-0 left-0 z-30 flex flex-col border-r border-bone-700 bg-bone-900 transition-all duration-200 ease-out",
          // Mobile: full width drawer
          open ? "w-64 translate-x-0" : "w-64 -translate-x-full",
          // Desktop: sticky column, width toggles between full and icon rail
          collapsed
            ? "md:sticky md:top-0 md:h-screen md:w-14 md:translate-x-0"
            : "md:sticky md:top-0 md:h-screen md:w-64 md:translate-x-0",
        )}
      >
        {/* Desktop collapse toggle — always visible at the top */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mx-auto mt-3 hidden rounded-md p-1.5 text-bone-400 transition-colors hover:bg-bone-800 hover:text-bone-200 md:block"
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
            {collapsed ? (
              // Expand icon (panel open)
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </>
            ) : (
              // Collapse icon (panel close)
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </>
            )}
          </svg>
        </button>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {sidebar}
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
