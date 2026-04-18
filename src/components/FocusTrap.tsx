"use client";

import { useEffect, useRef } from "react";

// Minimal focus trap for dialog / sheet-style overlays. design-oracle
// flagged the "one change I'd demand before v1 ships" was focus containment
// on the library modals — without it, Tab escapes to the page beneath
// and keyboard-only users end up in a dead-end.
//
// This is deliberately hand-rolled, not a react-aria FocusScope, because
// the repo has no accessibility-primitives dep yet and pulling one in
// for two callers is scope creep. If a third caller wants this behavior,
// revisit the dep trade-off.
//
// Behavior:
//   - On mount: captures the previously-focused element, then focuses
//     the trap container itself (tabIndex=-1) so a screen reader reads
//     the dialog heading (via aria-labelledby) and Tab moves INTO the
//     interactive content rather than starting on the close button.
//   - On Tab / Shift+Tab: wraps at the boundaries. If focus ever lands
//     outside the container (e.g. programmatic focus moved elsewhere),
//     the next Tab pulls it back in.
//   - On unmount: restores focus to the previously-focused element if
//     it's still in the document.

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "iframe",
].join(",");

// Forwards any div-shaped props (role, aria-*, onClick, style, etc.) so
// callers can use <FocusTrap> AS their dialog container — no extra
// wrapper div, aria-labelledby stays wired to the element that receives
// focus, click-stop handlers work naturally.
type Props = Omit<React.HTMLAttributes<HTMLDivElement>, "tabIndex"> & {
  children: React.ReactNode;
  /** Called when the user releases focus via Escape. Callers still handle Escape themselves — this is belt-and-suspenders. */
  onEscape?: () => void;
};

export function FocusTrap({ children, onEscape, ...divProps }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previousActive = document.activeElement as HTMLElement | null;

    // Focus the container itself so SR reads the dialog heading. Tab
    // moves into content on the first keypress.
    container.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (!container) return;
      if (e.key === "Escape" && onEscape) {
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = getFocusables(container);
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      const outside = !container.contains(active);

      if (e.shiftKey) {
        if (active === first || active === container || outside) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || outside) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previousActive && document.contains(previousActive)) {
        previousActive.focus({ preventScroll: true });
      }
    };
  }, [onEscape]);

  return (
    <div ref={containerRef} tabIndex={-1} {...divProps}>
      {children}
    </div>
  );
}

function getFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => {
    if (el.hasAttribute("inert")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    // Hidden via display:none / visibility:hidden won't be focusable
    // naturally; offsetParent===null catches most of those. Elements
    // with visibility:hidden ancestors also filter out.
    if (el.offsetParent === null && el.tagName !== "AREA") return false;
    return true;
  });
}
