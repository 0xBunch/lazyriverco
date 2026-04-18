"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { getPromptIcon } from "@/lib/prompt-icons";
import type { PromptGroupDTO } from "@/lib/chat";

type Props = {
  group: PromptGroupDTO;
  onPick: (prompt: string) => void;
  disabled?: boolean;
};

// Homepage suggestion-chip dropdown. Mirrors ChatsRowMenu's portal +
// click-outside pattern (per /Users/bunch/_kcb/lessons.md 2026-04-10
// portal lesson): menu renders via createPortal to document.body so
// ancestor transforms/filters can't capture position: fixed coords.
//
// Keyboard a11y (MVP):
//   - Esc closes
//   - click-outside closes
//   - native Tab cycles through menu items (they're plain buttons)
// Deferred post-MVP: Arrow-key roving tabindex, focus trap, typeahead.
export function PromptGroupMenu({ group, onPick, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleOpen(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left });
    setOpen((v) => !v);
  }

  function pick(prompt: string) {
    onPick(prompt);
    setOpen(false);
  }

  const GroupIcon = getPromptIcon(group.icon);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-bone-700 bg-bone-900/60 px-4 py-2 text-sm text-bone-200 transition-colors",
          "hover:border-claude-500/60 hover:text-claude-100",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
        )}
      >
        {GroupIcon ? (
          <GroupIcon aria-hidden="true" className="h-3.5 w-3.5" />
        ) : null}
        <span>{group.label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={group.label}
              style={{ top: coords.top, left: coords.left }}
              className="fixed z-50 min-w-[14rem] max-w-xs rounded-md border border-bone-700 bg-bone-900 py-1 text-sm shadow-xl"
            >
              {/* Reserve the icon gutter for the whole menu when any item
                  has an icon, so label columns stay aligned even when
                  some items lack their own icon. */}
              {(() => {
                const hasAnyIcon = group.items.some((i) =>
                  getPromptIcon(i.icon),
                );
                return group.items.map((item) => {
                  const ItemIcon = getPromptIcon(item.icon);
                  return (
                    <button
                      key={item.id}
                      role="menuitem"
                      type="button"
                      onClick={() => pick(item.prompt)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-bone-200 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:bg-bone-800"
                    >
                      {ItemIcon ? (
                        <ItemIcon
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 text-bone-400"
                        />
                      ) : hasAnyIcon ? (
                        <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      ) : null}
                      <span>{item.label}</span>
                    </button>
                  );
                });
              })()}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
