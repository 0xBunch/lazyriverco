"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type SidebarShellProps = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export function SidebarShell({ sidebar, children }: SidebarShellProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  // Track mobile viewport via matchMedia so we can hide the drawer from AT
  // when it's off-screen. Starts `false` on both server and first client
  // render (no SSR mismatch), then updates after mount.
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // Close drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Lock body scroll when drawer is open on mobile.
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
        className="fixed left-4 top-4 z-40 rounded-lg border border-bone-700 bg-bone-800/80 p-2 text-bone-100 backdrop-blur transition-colors hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 md:hidden"
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

      {/* Backdrop — only on mobile when open */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-bone-950/80 backdrop-blur-sm md:hidden"
        />
      ) : null}

      {/* Sidebar — desktop: fixed column; mobile: slide-in drawer.
          aria-hidden flips true only when closed on mobile; on desktop or
          when the drawer is open, it stays reachable by AT. */}
      <aside
        id="portal-sidebar"
        aria-label="Primary navigation"
        aria-hidden={drawerHidden ? "true" : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-bone-700 bg-bone-900 transition-transform duration-200 ease-out md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebar}
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
