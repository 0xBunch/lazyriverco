"use client";

import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { IconSend } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { MLCHAT_MAX_CONTENT_LENGTH } from "@/lib/mlchat/types";

// Composer for the room. Plain textarea + send button.
//
// Sending semantics:
//   - Enter alone → send
//   - Shift+Enter → newline
//   - Submit while disabled (empty / over cap / inflight) is a no-op
//   - On send, clears the textarea optimistically; restores on failure

type MLChatComposerProps = {
  /** Async submit. Resolves with no value on success; rejects with an
   *  Error whose message is surfaced as inline validation copy. */
  onSubmit: (content: string) => Promise<void>;
};

export function MLChatComposer({ onSubmit }: MLChatComposerProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmed = draft.trim();
  const overCap = draft.length > MLCHAT_MAX_CONTENT_LENGTH;
  const canSend = !pending && trimmed.length > 0 && !overCap;

  async function send() {
    if (!canSend) return;
    const content = trimmed;
    setPending(true);
    setError(null);
    setDraft(""); // optimistic — re-populate on failure below
    try {
      await onSubmit(content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send";
      setError(msg);
      setDraft(content); // restore so the user can retry
    } finally {
      setPending(false);
      // Refocus the textarea so the user can keep typing without a
      // mouse round-trip.
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send();
  }

  return (
    <form
      onSubmit={handleFormSubmit}
      className="border-t border-bone-800 bg-bone-950 px-4 py-3"
    >
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="mlchat-composer">
          Message the river
        </label>
        <textarea
          id="mlchat-composer"
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="message the river…"
          disabled={pending}
          className={cn(
            "flex-1 resize-none rounded-xl border border-bone-700 bg-bone-900 px-3 py-2 text-sm text-bone-50 placeholder:text-bone-500",
            "focus:border-claude-500/60 focus:outline-none focus:ring-2 focus:ring-claude-500/30",
            "disabled:cursor-not-allowed disabled:opacity-60",
            overCap && "border-rose-500/60 focus:border-rose-500/60 focus:ring-rose-500/30",
          )}
          aria-invalid={overCap || error !== null}
          aria-describedby={
            error ? "mlchat-composer-error" : overCap ? "mlchat-composer-cap" : undefined
          }
        />
        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
            canSend
              ? "bg-claude-500 text-bone-50 hover:bg-claude-400"
              : "bg-bone-800 text-bone-600",
          )}
          aria-label="Send message"
        >
          <IconSend aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1 flex justify-between gap-3 text-xs">
        <div
          id={error ? "mlchat-composer-error" : undefined}
          role={error ? "alert" : undefined}
          className={cn(error ? "text-rose-400" : "text-bone-500")}
        >
          {error ?? "enter to send · shift+enter for newline"}
        </div>
        <div
          id="mlchat-composer-cap"
          className={cn(
            "tabular-nums",
            overCap ? "text-rose-400" : "text-bone-600",
          )}
        >
          {draft.length}/{MLCHAT_MAX_CONTENT_LENGTH}
        </div>
      </div>
    </form>
  );
}
