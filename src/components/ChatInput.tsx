"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ChatInputProps = {
  onSubmit: (content: string) => Promise<void> | void;
  /** External disable — used by ConversationView to lock input while
   *  the agent reply is streaming. Stacks with the internal `sending`
   *  state so both gates must be clear for the input to be active. */
  disabled?: boolean;
  /** Optional override for the textarea placeholder. Used by the parent
   *  to reflect a mode change (e.g. "Describe an image…" when image
   *  generation mode is active). */
  placeholder?: string;
};

export function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = "Say something…",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-expand up to ~4 rows, then scroll internally. Uses the computed
  // line-height instead of a hardcoded constant so Tailwind changes don't
  // silently break the max height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const max = lineHeight * 4 + 16; // 4 lines + vertical padding
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSubmit(trimmed);
      setValue("");
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  const busy = sending || disabled;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex items-end gap-2 border-t border-bone-700 bg-bone-900/80 px-4 py-3 backdrop-blur"
    >
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-input"
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        disabled={busy}
        rows={1}
        placeholder={placeholder}
        className={cn(
          "min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-bone-700 bg-bone-950 px-4 py-2 text-sm leading-5 text-bone-50 placeholder-bone-400",
          "focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className={cn(
          "rounded-2xl bg-claude-500 px-4 py-2 text-sm font-medium text-bone-50 transition-colors",
          "hover:bg-claude-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {busy ? "…" : "Send"}
      </button>
    </form>
  );
}
