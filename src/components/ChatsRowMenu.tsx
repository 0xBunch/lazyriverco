"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type Props = {
  conversationId: string;
  currentTitle: string;
  isStarred: boolean;
  isArchived: boolean;
};

// Per /Users/bunch/_kcb/lessons.md (2026-04-10 portal lesson): render
// the dropdown via createPortal to document.body so any future ancestor
// transform/filter doesn't capture position: fixed coordinates.
export function ChatsRowMenu({
  conversationId,
  currentTitle,
  isStarred,
  isArchived,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
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
    setCoords({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
    setOpen((v) => !v);
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function doStar() {
    await withBusy(async () => {
      const res = await fetch("/api/pins", {
        method: isStarred ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) return;
      router.refresh();
    });
  }

  async function doRename() {
    // window.prompt is deliberately minimal for v1. If/when this needs
    // richer UX (validation messaging, autosave, etc.), swap for an
    // inline input within the dropdown.
    const next = window.prompt("Rename conversation", currentTitle);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentTitle) return;
    await withBusy(async () => {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) return;
      router.refresh();
    });
  }

  async function doArchive() {
    await withBusy(async () => {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      router.refresh();
    });
  }

  async function doUnarchive() {
    await withBusy(async () => {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) return;
      router.refresh();
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        disabled={busy}
        aria-label="Conversation actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded p-1 text-bone-400 transition-colors hover:bg-bone-800 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:opacity-50"
      >
        <span aria-hidden className="block leading-none">
          ⋯
        </span>
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: coords.top, right: coords.right }}
              className="fixed z-50 w-44 rounded-md border border-bone-700 bg-bone-900 py-1 text-sm shadow-xl"
            >
              <MenuItem onClick={doRename} label="Rename" />
              <MenuItem
                onClick={doStar}
                label={isStarred ? "Unstar" : "Star"}
              />
              {isArchived ? (
                <MenuItem onClick={doUnarchive} label="Unarchive" />
              ) : (
                <MenuItem onClick={doArchive} label="Archive" />
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MenuItem({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-bone-200 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:bg-bone-800"
    >
      {label}
    </button>
  );
}
