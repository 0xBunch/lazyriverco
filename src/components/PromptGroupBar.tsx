"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { getPromptIcon } from "@/lib/prompt-icons";
import type { PromptGroupDTO } from "@/lib/chat";

type Props = {
  groups: readonly PromptGroupDTO[];
  onPick: (prompt: string) => void;
  disabled?: boolean;
};

// Claude-style category bar: default is a row of chips; clicking a chip
// swaps the row for a full-width panel showing that group's items. Only
// one group can be open at a time. Escape / × / picking an item returns
// focus to the originating chip.
export function PromptGroupBar({ groups, onPick, disabled }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Chip to focus once the chip row re-mounts after the panel's exit
  // animation. A ref (not state) avoids triggering a parent re-render
  // every time a closing chip self-focuses, and dodges the render
  // cascade that would re-run every ChipButton's props.
  const pendingFocusIdRef = useRef<string | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const panelId = useId();

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const selectedGroup =
    selectedId != null ? groups.find((g) => g.id === selectedId) ?? null : null;

  // If the opened group vanishes from `groups` (admin edit, revalidation),
  // close the panel cleanly and seed focus-return if the id still exists.
  useEffect(() => {
    if (selectedId != null && selectedGroup == null) {
      pendingFocusIdRef.current = null;
      setSelectedId(null);
    }
  }, [selectedId, selectedGroup]);

  // Move focus onto the close button exactly once per open transition.
  // Depending on `selectedId` (primitive) rather than `selectedGroup`
  // (object) avoids stealing focus back from the user on every render
  // where `groups` re-identifies (e.g. SWR revalidation).
  useEffect(() => {
    if (selectedId != null) closeBtnRef.current?.focus();
  }, [selectedId]);

  // Escape closes the panel. Same `[selectedId]` rule as above.
  useEffect(() => {
    if (selectedId == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function openPanel(id: string) {
    // Clear any stale return target from a prior close so rapid
    // chip-to-chip toggling doesn't send focus to the wrong chip.
    pendingFocusIdRef.current = null;
    setSelectedId(id);
  }

  function closePanel() {
    pendingFocusIdRef.current = selectedId;
    setSelectedId(null);
  }

  function pick(prompt: string) {
    onPick(prompt);
    closePanel();
  }

  if (groups.length === 0) return null;

  const transition = { duration: 0.16, ease: "easeOut" as const };

  return (
    <div className="relative">
      <AnimatePresence mode="wait" initial={false}>
        {selectedGroup ? (
          <motion.div
            key="panel"
            id={panelId}
            role="region"
            aria-label={selectedGroup.label}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={transition}
            className="overflow-hidden rounded-3xl border border-bone-700 bg-bone-900/90"
          >
            <PanelHeader
              group={selectedGroup}
              closeRef={closeBtnRef}
              onClose={closePanel}
            />
            <div className="border-t border-bone-800">
              <PanelItems group={selectedGroup} onPick={pick} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="chips"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={transition}
            className="flex flex-wrap justify-center gap-2"
          >
            {groups.map((group) => (
              <ChipButton
                key={group.id}
                group={group}
                disabled={disabled}
                panelId={panelId}
                pendingFocusIdRef={pendingFocusIdRef}
                onOpen={() => openPanel(group.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type ChipButtonProps = {
  group: PromptGroupDTO;
  disabled?: boolean;
  panelId: string;
  pendingFocusIdRef: React.MutableRefObject<string | null>;
  onOpen: () => void;
};

function ChipButton({
  group,
  disabled,
  panelId,
  pendingFocusIdRef,
  onOpen,
}: ChipButtonProps) {
  const GroupIcon = getPromptIcon(group.icon);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pendingFocusIdRef.current === group.id) {
      btnRef.current?.focus();
      pendingFocusIdRef.current = null;
    }
    // Runs once on mount — the chip row re-mounts after each panel close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-controls={panelId}
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
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

type PanelHeaderProps = {
  group: PromptGroupDTO;
  closeRef: React.RefObject<HTMLButtonElement>;
  onClose: () => void;
};

function PanelHeader({ group, closeRef, onClose }: PanelHeaderProps) {
  const GroupIcon = getPromptIcon(group.icon);
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5">
      <div className="flex items-center gap-2 text-bone-50">
        {GroupIcon ? (
          <GroupIcon aria-hidden="true" className="h-4 w-4" />
        ) : null}
        <span className="text-sm font-medium">{group.label}</span>
      </div>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close category"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-bone-300 transition-colors",
          "hover:bg-bone-800 hover:text-bone-50",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

type PanelItemsProps = {
  group: PromptGroupDTO;
  onPick: (prompt: string) => void;
};

function PanelItems({ group, onPick }: PanelItemsProps) {
  // Reserve the icon gutter for the whole list when any item has an
  // icon, so label columns stay aligned even when some items lack one.
  const hasAnyIcon = group.items.some((i) => getPromptIcon(i.icon));
  return (
    <div className="py-1">
      {group.items.map((item) => {
        const ItemIcon = getPromptIcon(item.icon);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.prompt)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-bone-200 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:bg-bone-800 focus-visible:text-bone-50 focus-visible:shadow-[inset_3px_0_0_theme(colors.claude.500)]"
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
      })}
    </div>
  );
}
