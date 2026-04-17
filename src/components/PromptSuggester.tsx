"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type PromptSuggesterProps = {
  textareaId: string;
  endpoint?: string;
  extraPayload?: Record<string, string>;
};

export function PromptSuggester({
  textareaId,
  endpoint = "/api/admin/suggest-prompt",
  extraPayload,
}: PromptSuggesterProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleSuggest() {
    const textarea = document.getElementById(textareaId) as
      | HTMLTextAreaElement
      | null;
    if (!textarea) return;

    const current = textarea.value.trim();
    if (!current) {
      setError("Write something first, then ask for suggestions.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuggestion(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: current, ...extraPayload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        setError(data.error ?? "Suggestion failed");
        return;
      }

      const data = (await res.json()) as { suggestion: string };
      setSuggestion(data.suggestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    if (!suggestion) return;
    const textarea = document.getElementById(textareaId) as
      | HTMLTextAreaElement
      | null;
    if (!textarea) return;

    // Update the textarea value directly + trigger React's change detection
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    nativeSetter?.call(textarea, suggestion);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    setSuggestion(null);
  }

  function handleDismiss() {
    setSuggestion(null);
  }

  return (
    <div ref={containerRef} className="space-y-3">
      <button
        type="button"
        disabled={loading}
        onClick={handleSuggest}
        className={cn(
          "rounded-lg border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-200 transition-colors",
          "hover:border-claude-500/60 hover:text-claude-100",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
        )}
      >
        {loading ? "Thinking…" : "Suggest improvements"}
      </button>

      {error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : null}

      {suggestion ? (
        <div className="rounded-xl border border-claude-500/30 bg-bone-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-claude-300">
              Suggested rewrite
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-md border border-bone-700 bg-bone-800 px-3 py-1 text-xs font-medium text-bone-300 transition-colors hover:text-bone-100"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="rounded-md bg-claude-500 px-3 py-1 text-xs font-medium text-bone-50 transition-colors hover:bg-claude-600"
              >
                Use this
              </button>
            </div>
          </div>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-bone-200">
            {suggestion}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
