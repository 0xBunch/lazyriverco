"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type FollowupChipsProps = {
  suggestions: readonly string[];
  onPick: (text: string) => void;
  disabled?: boolean;
};

/**
 * Clickable follow-up prompt chips rendered under the most recent agent
 * message when a dialogue-mode agent decided to emit <followups> at the
 * end of its reply. Clicking a chip sends its text as a fresh user turn
 * — which clears the chips immediately (parent drops the suggestions
 * state before kicking off the new stream).
 */
export function FollowupChips({
  suggestions,
  onPick,
  disabled = false,
}: FollowupChipsProps) {
  const shouldReduceMotion = useReducedMotion();

  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="mx-auto mt-1 flex w-full max-w-3xl flex-wrap gap-2 px-4 pl-[calc(0.75rem+2.25rem+0.75rem)]"
    >
      {suggestions.map((text, i) => (
        <button
          key={`${i}-${text}`}
          type="button"
          disabled={disabled}
          onClick={() => onPick(text)}
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full border border-claude-500/40 bg-claude-500/10 px-3 py-1.5 text-xs font-medium text-claude-100 transition-colors",
            "hover:border-claude-400 hover:bg-claude-500/20 hover:text-claude-50",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "text-pretty",
          )}
          aria-label={`Ask: ${text}`}
        >
          <span aria-hidden="true" className="text-claude-400 group-hover:text-claude-200">
            →
          </span>
          {text}
        </button>
      ))}
    </motion.div>
  );
}
