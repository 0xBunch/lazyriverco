"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  PROMPT_ICONS,
  PROMPT_ICONS_BY_CATEGORY,
  PROMPT_ICON_CATEGORIES,
  type PromptIconCategory,
  type PromptIconName,
} from "@/lib/prompt-icons";

// Grid-based Tabler icon picker used inside admin forms. With ~120
// icons across 7 categories, a flat grid is too big to scan — so the
// picker adds a category chip row + a text search input. Both narrow
// the rendered grid; search beats category (typing shows matches
// across categories). A hidden input carries the selection into the
// enclosing <form> so server-action submission picks it up — no React
// state required at the form level.

type Props = {
  /** Form field name — server action reads FormData.get(name). */
  name: string;
  /** Initial selection (from DB row). Null shows "No icon" selected. */
  defaultValue: string | null;
};

type Filter = "All" | PromptIconCategory;

export function PromptIconPicker({ name, defaultValue }: Props) {
  // Normalize unknown-name rows to null so the picker doesn't show a
  // ghost selection the admin can't explain.
  const initial =
    defaultValue && defaultValue in PROMPT_ICONS
      ? (defaultValue as PromptIconName)
      : null;
  const [selected, setSelected] = useState<PromptIconName | null>(initial);
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");

  const visible = useMemo<readonly PromptIconName[]>(() => {
    const base =
      filter === "All"
        ? PROMPT_ICON_CATEGORIES.flatMap((c) => PROMPT_ICONS_BY_CATEGORY[c])
        : PROMPT_ICONS_BY_CATEGORY[filter];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((n) => n.toLowerCase().includes(q));
  }, [filter, query]);

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected ?? ""} />
      <div className="flex flex-wrap items-center justify-between gap-2">
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

      <div className="flex flex-wrap items-center gap-1">
        <CategoryChip
          active={filter === "All"}
          onClick={() => setFilter("All")}
        >
          All
        </CategoryChip>
        {PROMPT_ICON_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            active={filter === c}
            onClick={() => setFilter(c)}
          >
            {c}
          </CategoryChip>
        ))}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons…"
        aria-label="Search icons"
        className="w-full rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-xs text-bone-100 placeholder-bone-500 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
      />

      {visible.length === 0 ? (
        <p className="rounded-md border border-bone-800 bg-bone-950/60 p-3 text-xs italic text-bone-400">
          No icons match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Icon"
          className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto rounded-md border border-bone-800 bg-bone-950/60 p-2 sm:grid-cols-10 md:grid-cols-12"
        >
          {visible.map((iconName) => {
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
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400",
        active
          ? "border-claude-500/60 bg-claude-500/20 text-claude-100"
          : "border-bone-800 bg-bone-900/40 text-bone-300 hover:border-bone-700 hover:text-bone-100",
      )}
    >
      {children}
    </button>
  );
}
