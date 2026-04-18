"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PROMPT_ICON_NAMES, PROMPT_ICONS } from "@/lib/prompt-icons";

// Grid-based Lucide icon picker used inside admin forms. Renders a
// hidden input so standard <form> + server-action submission picks up
// the selection — no React state required at the form level.

type Props = {
  /** Form field name — server action reads FormData.get(name). */
  name: string;
  /** Initial selection (from DB row). Null shows "No icon" selected. */
  defaultValue: string | null;
};

export function PromptIconPicker({ name, defaultValue }: Props) {
  // Normalize unknown-name rows to null so the picker doesn't show a
  // "ghost selection" the admin can't explain.
  const initial =
    defaultValue && defaultValue in PROMPT_ICONS ? defaultValue : null;
  const [selected, setSelected] = useState<string | null>(initial);

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected ?? ""} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-bone-300">
          Icon{" "}
          <span className="text-bone-500">
            {selected ? `(${selected})` : "(none)"}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setSelected(null)}
          disabled={selected === null}
          className="text-xs text-bone-400 underline-offset-2 transition-colors hover:text-bone-100 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <div
        role="radiogroup"
        aria-label="Icon"
        className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-md border border-bone-800 bg-bone-950/60 p-2 sm:grid-cols-10"
      >
        {PROMPT_ICON_NAMES.map((iconName) => {
          const Icon = PROMPT_ICONS[iconName];
          const isSelected = selected === iconName;
          return (
            <button
              key={iconName}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={iconName}
              title={iconName}
              onClick={() => setSelected(iconName)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400",
                isSelected
                  ? "border-claude-500/60 bg-claude-500/20 text-claude-100"
                  : "border-bone-800 bg-bone-900/40 text-bone-300 hover:border-bone-700 hover:text-bone-100",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
