"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebarDrawer } from "@/components/SidebarShell";
import { PanelToggleIcon } from "@/components/PanelToggleIcon";

/// Top-level sport sections rendered as direct links in the bar.
const SECTIONS = [
  { label: "NFL", href: "/sports/nfl" },
  { label: "MLB", href: "/sports/mlb" },
  { label: "NHL", href: "/sports/nhl" },
  { label: "NBA", href: "/sports/nba" },
  { label: "WNBA", href: "/sports/wnba" },
] as const;

const COLLEGE_HREF = "/sports/college";

/// College has its own row of sub-sports. Desktop opens this as a
/// dropdown menu; mobile pill links straight to the /sports/college hub
/// where the same three cards live as a touch-friendly grid.
const COLLEGE_SUBSECTIONS = [
  { label: "Football", href: "/sports/college/football" },
  { label: "Basketball", href: "/sports/college/basketball" },
  { label: "Volleyball", href: "/sports/college/volleyball" },
] as const;

function isSectionActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/// Full-viewport-width red header bar for the /sports/* section. Renders
/// only when the active route starts with /sports. Uses
/// `useSidebarDrawer()` to drive the global sidebar from its mobile
/// hamburger — the SidebarShell suppresses its own FAB on /sports so the
/// two triggers do not double up.
export function MlsnHeaderBar() {
  const pathname = usePathname();
  const { setOpen: setSidebarOpen } = useSidebarDrawer();
  const [collegeOpen, setCollegeOpen] = useState(false);
  const collegeRef = useRef<HTMLLIElement>(null);

  // Close the College dropdown when the route changes.
  useEffect(() => {
    setCollegeOpen(false);
  }, [pathname]);

  // Esc closes the College dropdown.
  useEffect(() => {
    if (!collegeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCollegeOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collegeOpen]);

  // Outside-click closes the College dropdown.
  useEffect(() => {
    if (!collegeOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        collegeRef.current &&
        !collegeRef.current.contains(e.target as Node)
      ) {
        setCollegeOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [collegeOpen]);

  if (!pathname?.startsWith("/sports")) return null;

  const collegeActive = isSectionActive(pathname, COLLEGE_HREF);

  return (
    <header
      role="banner"
      className="w-full bg-mlsn-500 pt-[env(safe-area-inset-top)] text-white"
    >
      {/* Row 1 — wordmark + (desktop) nav / (mobile) hamburger */}
      <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/sports"
          aria-label="MLSN home"
          className="font-nippo text-2xl font-bold tracking-tight text-white outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-mlsn-500 md:text-[26px]"
        >
          MLSN
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Sports sections" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {SECTIONS.map((s) => {
              const active = isSectionActive(pathname, s.href);
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-sm px-3 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-mlsn-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
                      active && "bg-mlsn-700",
                    )}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}

            {/* College — disclosure-pattern dropdown of sub-sport links.
                Plain <ul>+<a>; not role="menu" (which would obligate
                arrow-key item navigation per ARIA APG). aria-controls
                points at the panel and aria-expanded reflects state. */}
            <li ref={collegeRef} className="relative">
              <button
                type="button"
                onClick={() => setCollegeOpen((o) => !o)}
                aria-expanded={collegeOpen}
                aria-controls="mlsn-college-panel"
                className={cn(
                  "flex items-center gap-1.5 rounded-sm px-3 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-mlsn-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
                  (collegeActive || collegeOpen) && "bg-mlsn-700",
                )}
              >
                College
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    "h-3 w-3 transition-transform",
                    collegeOpen && "rotate-180",
                  )}
                >
                  <path d="m3 4.5 3 3 3-3" />
                </svg>
              </button>

              {collegeOpen ? (
                <ul
                  id="mlsn-college-panel"
                  className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] overflow-hidden rounded-sm bg-mlsn-700 py-1 shadow-lg"
                >
                  {COLLEGE_SUBSECTIONS.map((sub) => {
                    const active = isSectionActive(pathname, sub.href);
                    return (
                      <li key={sub.href}>
                        <Link
                          href={sub.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setCollegeOpen(false)}
                          className={cn(
                            "block px-4 py-2.5 font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-mlsn-500 focus:bg-mlsn-500 focus:outline-none",
                            active && "bg-mlsn-500",
                          )}
                        >
                          {sub.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          </ul>
        </nav>

        {/* Mobile hamburger — opens the SidebarShell drawer via context */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          aria-controls="portal-sidebar"
          className="rounded-md p-2 text-white transition-colors hover:bg-mlsn-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:hidden"
        >
          <PanelToggleIcon variant="open" className="h-5 w-5" />
        </button>
      </div>

      {/* Row 2 (mobile only) — horizontal scroll of section pills.
          College on mobile links straight to the hub instead of opening
          an inline dropdown — keeps the strip simple, avoids nested
          touch menus. */}
      <nav aria-label="Sports sections" className="md:hidden">
        <ul className="flex snap-x gap-1 overflow-x-auto px-3 pb-2">
          {SECTIONS.map((s) => {
            const active = isSectionActive(pathname, s.href);
            return (
              <li key={s.href} className="shrink-0 snap-start">
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-sm px-3 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-white",
                    active ? "bg-mlsn-700" : "hover:bg-mlsn-700",
                  )}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
          <li className="shrink-0 snap-start">
            <Link
              href={COLLEGE_HREF}
              aria-current={collegeActive ? "page" : undefined}
              className={cn(
                "block rounded-sm px-3 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-white",
                collegeActive ? "bg-mlsn-700" : "hover:bg-mlsn-700",
              )}
            >
              College
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
