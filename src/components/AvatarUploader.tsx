"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Single-file headshot uploader for the admin agent form. Picks a file,
// POSTs /api/avatars/presign to get a direct-to-R2 POST URL, uploads via
// XHR so we get progress, then calls onChange(publicUrl). onChange(null)
// clears.
//
// Why not reuse MediaUploader: that component is multi-file, library-
// specific, and ~400 lines. The avatar case is narrow — one file, a
// square preview, no caption, a tighter 2 MB cap. Short-term duplication
// is cheaper than perturbing the library component. A future follow-up
// can extract a shared useDirectUpload() hook if a third uploader shows up.
//
// Allowlist mirrors src/lib/r2.ts (server enforces authoritatively).

const CLIENT_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const CLIENT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — matches MAX_AVATAR_BYTES

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number }
  | { kind: "error"; message: string };

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
};

export function AvatarUploader({ value, onChange, className }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track in-flight XHR so unmount cancels it.
  const inFlightRef = useRef<{ abort: () => void } | null>(null);
  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
    };
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!CLIENT_ALLOWED_MIME.includes(file.type as (typeof CLIENT_ALLOWED_MIME)[number])) {
      setStatus({
        kind: "error",
        message: `Unsupported type "${file.type}". Use JPG, PNG, WEBP, or GIF.`,
      });
      return;
    }
    if (file.size > CLIENT_MAX_BYTES) {
      setStatus({
        kind: "error",
        message: `Too big (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.`,
      });
      return;
    }

    setStatus({ kind: "uploading", pct: 0 });

    let presigned: {
      uploadUrl: string;
      publicUrl: string;
      contentType: string;
    };
    try {
      const res = await fetch("/api/avatars/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Presign failed (${res.status}).`);
      }
      presigned = await res.json();
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not start upload.",
      });
      return;
    }

    // Direct PUT to R2. Raw file body; Content-Type MUST match what was
    // signed or R2 returns 403 SignatureDoesNotMatch.
    const xhr = new XMLHttpRequest();
    inFlightRef.current = { abort: () => xhr.abort() };

    await new Promise<void>((resolve) => {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setStatus({ kind: "uploading", pct });
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setStatus({ kind: "idle" });
          onChangeRef.current(presigned.publicUrl);
        } else {
          setStatus({
            kind: "error",
            message: `Upload failed (HTTP ${xhr.status}).`,
          });
        }
        resolve();
      });
      xhr.addEventListener("error", () => {
        setStatus({ kind: "error", message: "Network error during upload." });
        resolve();
      });
      xhr.addEventListener("abort", () => {
        setStatus({ kind: "idle" });
        resolve();
      });
      xhr.open("PUT", presigned.uploadUrl);
      xhr.setRequestHeader("Content-Type", presigned.contentType);
      xhr.send(file);
    });

    inFlightRef.current = null;
  }, []);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = ""; // allow re-selecting the same file
  };

  const onRemove = () => {
    inFlightRef.current?.abort();
    onChange(null);
    setStatus({ kind: "idle" });
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bone-800 ring-1 ring-black/40">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Current avatar"
            className="h-16 w-16 object-cover"
          />
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-bone-400">
            No photo
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={CLIENT_ALLOWED_MIME.join(",")}
          onChange={onFileInputChange}
          className="sr-only"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={status.kind === "uploading"}
            className="rounded-full border border-bone-700 bg-bone-800 px-3 py-1 text-xs font-semibold text-bone-100 transition-colors hover:border-claude-500/60 hover:text-claude-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {value ? "Replace" : "Upload headshot"}
          </button>
          {value ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={status.kind === "uploading"}
              className="rounded-full border border-bone-700 bg-transparent px-3 py-1 text-xs font-medium text-bone-300 transition-colors hover:border-red-500/60 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </div>
        <StatusLine status={status} />
      </div>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") {
    return (
      <p className="text-[0.7rem] text-bone-400">
        JPG, PNG, WEBP, or GIF · max 2 MB · square works best
      </p>
    );
  }
  if (status.kind === "uploading") {
    return (
      <p className="text-[0.7rem] text-claude-200" aria-live="polite">
        Uploading… {status.pct}%
      </p>
    );
  }
  return (
    <p className="text-[0.7rem] text-red-300" role="alert">
      {status.message}
    </p>
  );
}
