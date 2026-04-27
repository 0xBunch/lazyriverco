"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PanelToggleIcon } from "@/components/PanelToggleIcon";

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
      {/* Mobile trigger — only rendered when drawer is closed. Once the
          drawer opens, the close button inside the drawer (below) takes
          over. Same glyph family (panel-toggle) as the close + desktop
          collapse buttons; claude.ai uses one icon in all three spots.
          Position uses env(safe-area-inset-*) so on iOS PWA with
          viewportFit:cover + black-translucent status bar, the button
          lands below the notch/Dynamic Island, not under it. p-3 + h-5
          icon = 44x44 tap target (Apple HIG minimum). */}
      {!open ? (
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
        // pt-[env(safe-area-inset-top)] pushes the wordmark row below the
        // iOS status bar when the drawer opens in standalone PWA mode.
        // Resolves to 0 on everything else (Android, desktop) so non-iOS
        // layout is unchanged.
        className={cn(
          "group fixed inset-y-0 left-0 z-30 flex flex-col border-r border-bone-700 bg-bone-900 pt-[env(safe-area-inset-top)] transition-all duration-200 ease-out",
          // Mobile: full width drawer
          open ? "w-64 translate-x-0" : "w-64 -translate-x-full",
          // Desktop: sticky column, width toggles between full and icon rail
          collapsed
            ? "md:sticky md:top-0 md:h-screen md:w-14 md:translate-x-0"
            : "md:sticky md:top-0 md:h-screen md:w-64 md:translate-x-0",
        )}
      >
        {/* Mobile close button — top-right of drawer, visible only when
            drawer is open on mobile. Claude's pattern: open-button lives
            at a fixed spot outside the drawer, close-button lives at a
            fixed spot inside the drawer. Same glyph as the trigger and
            desktop collapse buttons. Position uses env(safe-area-inset-top)
            so it stays clear of the iOS status bar — `absolute` children
            aren't pushed by the aside's padding, so we add the inset
            directly to the `top` calc. */}
        {open ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.625rem)] z-10 rounded-md p-1.5 text-bone-400 transition-colors hover:bg-bone-800 hover:text-bone-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 md:hidden"
          >
            <PanelToggleIcon variant="close" className="h-5 w-5" />
          </button>
        ) : null}

        {/* Desktop collapse toggle — top-right corner when expanded,
            centered on the rail when collapsed. Uses `expand` variant
            (divider on the right) to hint "content expands right" when
            collapsed, and `close` variant (divider on the left) when
            expanded to hint "dismiss panel left". Desktop doesn't need
            safe-area — browsers don't render under OS chrome on desktop. */}
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

      {/* Main content — pt-[env(safe-area-inset-top)] on mobile keeps
          page headings (like the "Good morning, …" greeting) out from
          under the iOS status bar. Desktop has no standalone chrome so
          pt-0 applies. The mobile trigger button sits in the same strip
          with its own safe-area offset, so they coexist without overlap. */}
      <main className="min-w-0 flex-1 pt-[env(safe-area-inset-top)] md:pt-0">
        {children}
      </main>
    </div>
  );
}
