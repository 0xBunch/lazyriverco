"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PanelToggleIcon } from "@/components/PanelToggleIcon";

type SidebarDrawer = {
  open: boolean;
  setOpen: (next: boolean) => void;
};

const SidebarDrawerContext = createContext<SidebarDrawer | null>(null);

/// Hook for controlling the sidebar drawer's open state from a sibling
/// component (e.g. MlsnHeaderBar's mobile hamburger). Throws if used
/// outside <SidebarShell> to surface wiring mistakes loudly.
export function useSidebarDrawer(): SidebarDrawer {
  const ctx = useContext(SidebarDrawerContext);
  if (!ctx) {
    throw new Error("useSidebarDrawer must be used within <SidebarShell>");
  }
  return ctx;
}

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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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

  // Focus management for the mobile drawer. When it opens, capture the
  // element that had focus (the trigger — could be the FAB or the
  // MlsnHeaderBar hamburger) and move focus into the drawer's close
  // button. On close, restore focus to the original trigger if still in
  // the document. Desktop sticky-sidebar mode is exempt (no overlay).
  useEffect(() => {
    if (!isMobile) return;
    if (open) {
      previousFocusRef.current =
        (document.activeElement as HTMLElement | null) ?? null;
      closeButtonRef.current?.focus();
    } else if (previousFocusRef.current) {
      const target = previousFocusRef.current;
      previousFocusRef.current = null;
      if (document.contains(target)) target.focus();
    }
  }, [open, isMobile]);

  const drawerHidden = isMobile && !open;
  // /sports/* renders an MlsnHeaderBar with its own mobile hamburger. Hide
  // this shell's FAB on those routes so the two triggers don't double up.
  const hideMobileFab = pathname?.startsWith("/sports") ?? false;

  return (
    <SidebarDrawerContext.Provider value={{ open, setOpen }}>
      <div className="flex min-h-screen">
        {/* Mobile trigger — only rendered when drawer is closed AND no
            route-specific chrome (e.g. MlsnHeaderBar) is providing its
            own hamburger. Same env-inset positioning + 44px tap target. */}
        {!hideMobileFab && !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={false}
            aria-controls="portal-sidebar"
            className="fixed left-[calc(env(safe-area-inset-left)+0.5rem)] top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 rounded-lg border border-bone-700 bg-bone-800/80 p-3 text-bone-100 backdrop-blur transition-all hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 md:hidden"
          >
            <PanelToggleIcon variant="open" className="h-5 w-5" />
          </button>
        ) : null}

        {/* Mobile backdrop */}
        {open ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-bone-950/80 backdrop-blur-sm md:hidden"
          />
        ) : null}

        {/* Sidebar — desktop: sticky with icon-rail collapse. The
            `group` class + `data-collapsed` attribute lets child
            components toggle full vs. icon-only via Tailwind variants
            without prop drilling into the server-rendered Sidebar. */}
        <aside
          id="portal-sidebar"
          aria-label="Primary navigation"
          aria-hidden={drawerHidden ? "true" : undefined}
          data-collapsed={collapsed ? "" : undefined}
          className={cn(
            "group fixed inset-y-0 left-0 z-30 flex flex-col border-r border-bone-700 bg-bone-900 pt-[env(safe-area-inset-top)] transition-all duration-200 ease-out",
            open ? "w-64 translate-x-0" : "w-64 -translate-x-full",
            collapsed
              ? "md:sticky md:top-0 md:h-screen md:w-14 md:translate-x-0"
              : "md:sticky md:top-0 md:h-screen md:w-64 md:translate-x-0",
          )}
        >
          {/* Mobile close button — top-right of drawer, visible only
              when drawer is open on mobile. Receives focus when the
              drawer opens (focus management effect above). */}
          {open ? (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.625rem)] z-10 rounded-md p-1.5 text-bone-400 transition-colors hover:bg-bone-800 hover:text-bone-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 md:hidden"
            >
              <PanelToggleIcon variant="close" className="h-5 w-5" />
            </button>
          ) : null}

          {/* Desktop collapse toggle. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute right-2 top-2.5 z-10 hidden rounded-md p-1.5 text-bone-400 transition-colors hover:bg-bone-800 hover:text-bone-200 group-data-[collapsed]:static group-data-[collapsed]:mx-auto group-data-[collapsed]:mt-3 md:block"
          >
            <PanelToggleIcon
              variant={collapsed ? "expand" : "close"}
              className="h-5 w-5"
            />
          </button>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden group-data-[collapsed]:overflow-visible">
            {sidebar}
          </div>
        </aside>

        {/* Main content. Section-specific chrome (like the MlsnHeaderBar
            on /sports/*) renders inside this column from a nested layout,
            so it stays within the canvas right of the sidebar. */}
        <main className="min-w-0 flex-1 pt-[env(safe-area-inset-top)] md:pt-0">
          {children}
        </main>
      </div>
    </SidebarDrawerContext.Provider>
  );
}
