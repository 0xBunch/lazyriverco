"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SaveButtonProps = {
  label?: string;
  className?: string;
};

export function SaveButton({ label = "Save", className }: SaveButtonProps) {
  const { pending } = useFormStatus();
  const [justSaved, setJustSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !pending) {
      setJustSaved(true);
      const timer = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = pending;
  }, [pending]);

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950",
        justSaved
          ? "bg-emerald-600 text-bone-50"
          : "bg-claude-500 text-bone-50 hover:bg-claude-600",
        pending && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {pending ? "Saving…" : justSaved ? "Saved ✓" : label}
    </button>
  );
}
