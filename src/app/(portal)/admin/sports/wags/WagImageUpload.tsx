"use client";

import { useId, useRef, useState } from "react";

// Direct-to-R2 upload widget for SportsWag.imageUrl. Mirrors the
// UploadImageField pattern from /admin/sports/sponsors but talks to
// /api/admin/sports/wags/presign instead. On success it calls
// `onUploaded` with the R2 public URL + key so the parent WagForm can
// prefill the imageUrl input AND set the hidden imageR2Key field.

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // mirrors MAX_SPONSOR_BYTES (same cap on r2.ts)

type PresignResponse = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
};

type Status =
  | { kind: "idle" }
  | { kind: "presigning" }
  | { kind: "uploading"; pct: number }
  | { kind: "ready"; key: string; publicUrl: string }
  | { kind: "error"; message: string };

type Props = {
  /// Called when the upload succeeds. Parent uses this to prefill the
  /// imageUrl text input and the hidden imageR2Key input.
  onUploaded: (info: { key: string; publicUrl: string }) => void;
  /// Called when the admin clicks "Remove" so the parent can clear
  /// imageR2Key (the existing imageUrl text stays — admin may want to
  /// keep the typed URL).
  onCleared: () => void;
  /// Existing R2 key when editing a WAG that was previously uploaded.
  /// The component renders this as the initial state. The parent owns
  /// the imageR2Key/imageUrl inputs; we just visually reflect them.
  initialKey?: string | null;
  initialPublicUrl?: string | null;
};

export function WagImageUpload({
  onUploaded,
  onCleared,
  initialKey = null,
  initialPublicUrl = null,
}: Props) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(() =>
    initialKey && initialPublicUrl
      ? { kind: "ready", key: initialKey, publicUrl: initialPublicUrl }
      : { kind: "idle" },
  );

  async function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIMES.includes(file.type)) {
      setStatus({
        kind: "error",
        message: `Unsupported type "${file.type}". Use JPG, PNG, WebP, or GIF.`,
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({
        kind: "error",
        message: `Image is ${Math.round(file.size / 1024 / 1024)} MB — max is 5 MB.`,
      });
      return;
    }

    setStatus({ kind: "presigning" });

    let presigned: PresignResponse;
    try {
      const res = await fetch("/api/admin/sports/wags/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Presign failed (${res.status})`);
      }
      presigned = (await res.json()) as PresignResponse;
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't prepare upload.",
      });
      return;
    }

    setStatus({ kind: "uploading", pct: 0 });

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presigned.uploadUrl);
        xhr.setRequestHeader("Content-Type", presigned.contentType);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            setStatus({
              kind: "uploading",
              pct: Math.round((evt.loaded / evt.total) * 100),
            });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`R2 PUT failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(file);
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Upload failed.",
      });
      return;
    }

    setStatus({ kind: "ready", key: presigned.key, publicUrl: presigned.publicUrl });
    onUploaded({ key: presigned.key, publicUrl: presigned.publicUrl });
  }

  function clear() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setStatus({ kind: "idle" });
    onCleared();
  }

  return (
    <div className="rounded-lg border border-bone-700 bg-bone-950/40 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-start gap-3">
        {status.kind === "ready" ? (
          <>
            <span className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-md border border-bone-800 bg-bone-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={status.publicUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="break-all font-mono text-[10px] uppercase tracking-widest text-bone-400">
                {status.key}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="inline-flex items-center rounded-md border border-bone-800 bg-bone-950 px-3 py-1.5 text-xs font-medium text-bone-300 hover:bg-bone-900"
                >
                  Remove
                </button>
              </div>
            </div>
          </>
        ) : (
          <label
            htmlFor={inputId}
            className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-md border border-dashed border-bone-700 bg-bone-950/50 px-3 py-4 text-sm text-bone-300 hover:border-claude-500 hover:bg-bone-900"
          >
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-400">
              Upload to R2 (optional)
            </span>
            <span className="text-bone-200">
              Click to upload a permanent copy — JPG, PNG, WebP, or GIF, ≤5 MB.
            </span>
            <span className="text-[11px] text-bone-500">
              Filling this out also sets the URL field above. R2-uploaded
              images survive the original source going 404 / hotlink-blocked.
            </span>
          </label>
        )}
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={ALLOWED_MIMES.join(",")}
        onChange={onFile}
        className="hidden"
      />

      {status.kind === "presigning" && (
        <p className="mt-2 text-xs text-bone-300">Preparing upload…</p>
      )}
      {status.kind === "uploading" && (
        <p className="mt-2 text-xs text-bone-300">
          Uploading… {status.pct}%
        </p>
      )}
      {status.kind === "error" && (
        <p className="mt-2 text-xs text-red-300">{status.message}</p>
      )}
    </div>
  );
}
