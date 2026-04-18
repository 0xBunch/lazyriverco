"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Reusable admin-facing photo uploader. Drag-drop + click-to-pick.
// Multi-file uploads run in parallel. Per-file progress via XHR
// upload events (fetch doesn't expose upload progress). The component
// is presentational: it emits onUploaded() per successful file and
// lets the parent decide what to do with the media (attach to calendar
// entry, attach to member profile, etc.) — keeping it module-agnostic.
//
// Matches the server allowlist in src/lib/r2.ts — duplicated as
// constants rather than imported because r2.ts is server-only.
//
// Accessibility: the drop zone is a focusable button; Enter/Space fires
// the hidden file input, matching the native picker UX for keyboard users.

const CLIENT_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const CLIENT_MAX_BYTES = 25 * 1024 * 1024;

type UploadStatus =
  | { kind: "queued" }
  | { kind: "uploading"; pct: number }
  | { kind: "committing" }
  | { kind: "done" }
  | { kind: "error"; message: string };

type FileEntry = {
  // Monotonic client-only key so React doesn't get confused if two files
  // share a name (the browser File object is the same reference, but we
  // might see multiple drops of foo.jpg before any complete).
  clientId: string;
  file: File;
  status: UploadStatus;
  mediaId?: string;
  publicUrl?: string;
};

export type UploadedMedia = {
  mediaId: string;
  url: string;
};

type Props = {
  onUploaded: (media: UploadedMedia) => void;
  /** Optional max count. Null = unlimited. Defaults to unlimited. */
  maxFiles?: number | null;
  /** Extra class on the outer container. */
  className?: string;
};

export function MediaUploader({ onUploaded, maxFiles = null, className }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  // Stable ref to onUploaded so the per-file promise chain doesn't see
  // a stale closure if the parent re-renders mid-upload.
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  // Tracks every in-flight upload so we can cancel on unmount. Without
  // this an admin who drops 10 photos and then clicks another nav link
  // silently keeps uploading AND keeps firing attach server actions
  // after they've left the page — both wasteful and confusing.
  const inFlightRef = useRef<Set<{ abort: () => void }>>(new Set());
  useEffect(() => {
    const set = inFlightRef.current;
    return () => {
      for (const canceler of set) {
        try {
          canceler.abort();
        } catch {
          // noop — best-effort cleanup
        }
      }
      set.clear();
    };
  }, []);

  const updateEntry = useCallback(
    (clientId: string, patch: Partial<FileEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.clientId === clientId ? { ...e, ...patch } : e)),
      );
    },
    [],
  );

  const uploadOne = useCallback(
    async (entry: FileEntry) => {
      // One AbortController per upload. The presign + commit fetches use
      // its signal; the XHR is wired to abort on signal too. Registered
      // in inFlightRef so the unmount cleanup can cancel everything.
      const controller = new AbortController();
      const canceler = { abort: () => controller.abort() };
      inFlightRef.current.add(canceler);

      try {
        // 1. Presign (server creates PENDING Media row).
        const presignRes = await fetch("/api/media/presign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mimeType: entry.file.type }),
          signal: controller.signal,
        });
        if (!presignRes.ok) {
          const body = (await presignRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Presign failed (${presignRes.status})`);
        }
        const presign = (await presignRes.json()) as {
          mediaId: string;
          uploadUrl: string;
          publicUrl: string;
          contentType: string;
        };

        // 2. Direct PUT to R2 with progress reporting. Raw file body,
        // Content-Type header MUST match what was signed or R2 returns
        // 403 SignatureDoesNotMatch.
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presign.uploadUrl);
          xhr.setRequestHeader("Content-Type", presign.contentType);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
              updateEntry(entry.clientId, {
                status: { kind: "uploading", pct },
              });
            }
          };
          xhr.onload = () => {
            // R2 returns 200 on successful PUT; treat any 2xx as OK.
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`R2 upload failed (${xhr.status})`));
          };
          xhr.onerror = () =>
            reject(new Error("Network error during upload"));
          xhr.onabort = () => reject(new Error("Upload aborted"));
          const onAbortSignal = () => xhr.abort();
          controller.signal.addEventListener("abort", onAbortSignal, {
            once: true,
          });
          xhr.send(entry.file);
        });

        // 3. Commit — flip PENDING → READY.
        updateEntry(entry.clientId, { status: { kind: "committing" } });
        const commitRes = await fetch("/api/media/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mediaId: presign.mediaId }),
          signal: controller.signal,
        });
        if (!commitRes.ok) {
          const body = (await commitRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Commit failed (${commitRes.status})`);
        }

        updateEntry(entry.clientId, {
          status: { kind: "done" },
          mediaId: presign.mediaId,
          publicUrl: presign.publicUrl,
        });
        setLiveAnnouncement(`${entry.file.name} uploaded`);

        onUploadedRef.current({
          mediaId: presign.mediaId,
          url: presign.publicUrl,
        });
      } catch (err) {
        // If the controller aborted (component unmounted), swallow
        // silently — the UI is gone. Otherwise surface the error.
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Upload failed";
        updateEntry(entry.clientId, {
          status: { kind: "error", message },
        });
      } finally {
        inFlightRef.current.delete(canceler);
      }
    },
    [updateEntry],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming: FileEntry[] = [];
      for (const file of Array.from(files)) {
        // Client-side validation — mirrors server allowlist so we reject
        // before spending a round trip. Server will re-check anyway.
        if (
          !CLIENT_ALLOWED_MIME.includes(
            file.type as (typeof CLIENT_ALLOWED_MIME)[number],
          )
        ) {
          incoming.push({
            clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            status: {
              kind: "error",
              message: `Unsupported type (${file.type || "unknown"}). JPG, PNG, WebP, GIF only.`,
            },
          });
          continue;
        }
        if (file.size > CLIENT_MAX_BYTES) {
          incoming.push({
            clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            status: {
              kind: "error",
              message: `Too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`,
            },
          });
          continue;
        }
        incoming.push({
          clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          status: { kind: "queued" },
        });
      }

      setEntries((prev) => {
        const combined = [...prev, ...incoming];
        if (maxFiles != null && combined.length > maxFiles) {
          return combined.slice(0, maxFiles);
        }
        return combined;
      });

      // Kick off uploads for the newly-queued entries.
      for (const e of incoming) {
        if (e.status.kind === "queued") {
          void uploadOne(e);
        }
      }
    },
    [uploadOne, maxFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const onFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
      // Reset so the same file can be re-picked after a prior failure.
      e.target.value = "";
    },
    [addFiles],
  );

  const removeEntry = useCallback((clientId: string) => {
    setEntries((prev) => prev.filter((e) => e.clientId !== clientId));
  }, []);

  const retryEntry = useCallback(
    (clientId: string) => {
      const entry = entries.find((e) => e.clientId === clientId);
      if (!entry) return;
      updateEntry(clientId, { status: { kind: "queued" } });
      void uploadOne({ ...entry, status: { kind: "queued" } });
    },
    [entries, uploadOne, updateEntry],
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragActive
            ? "border-claude-500 bg-claude-500/5"
            : "border-bone-700 bg-bone-900/50 hover:border-bone-600",
        )}
      >
        <label
          htmlFor={inputId}
          className="block cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-claude-500 focus-within:ring-offset-2 focus-within:ring-offset-bone-950"
        >
          <p className="text-sm font-medium text-bone-100">
            Drop photos here, or click to browse
          </p>
          <p className="mt-1 text-xs text-bone-400">
            JPG, PNG, WebP, GIF · up to 25 MB each
          </p>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={CLIENT_ALLOWED_MIME.join(",")}
            aria-label="Upload photos"
            onChange={onFilePick}
            className="sr-only"
          />
        </label>
      </div>

      {/* SR-only live region — announces upload completions so keyboard/AT
          users get the same "Uploaded ✓" feedback that sighted users see. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>

      {entries.length > 0 ? (
        <ul className="space-y-2">
          {entries.map((e) => (
            <UploadRow
              key={e.clientId}
              entry={e}
              onRemove={() => removeEntry(e.clientId)}
              onRetry={() => retryEntry(e.clientId)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type UploadRowProps = {
  entry: FileEntry;
  onRemove: () => void;
  onRetry: () => void;
};

function UploadRow({ entry, onRemove, onRetry }: UploadRowProps) {
  const { status, file, publicUrl } = entry;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-bone-800 bg-bone-900/70 p-2.5">
      {/* Thumb. Once committed we fall back to the server public URL so
          the admin sees the exact object that was persisted. Before that
          we use createObjectURL on the local File. */}
      <div
        className="h-12 w-12 flex-none overflow-hidden rounded-md bg-bone-800"
        aria-hidden="true"
      >
        {status.kind === "done" && publicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <LocalPreview file={file} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-bone-100">{file.name}</p>
        <div className="mt-1">
          <StatusLine status={status} />
        </div>
      </div>

      <div className="flex gap-1">
        {status.kind === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md px-2 py-1 text-xs font-medium text-claude-300 transition-colors hover:bg-bone-800 hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
          >
            Retry
          </button>
        ) : null}
        {status.kind === "done" || status.kind === "error" ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${file.name}`}
            className="rounded-md px-2 py-1 text-xs text-bone-300 transition-colors hover:bg-bone-800 hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
          >
            ×
          </button>
        ) : null}
      </div>
    </li>
  );
}

function LocalPreview({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);

  // Creating the object URL in an effect (not during render) so it runs
  // once per mounted file and we can revoke it on unmount to avoid
  // leaking blob handles across long admin sessions.
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-full w-full object-cover" />
  );
}

function StatusLine({ status }: { status: UploadStatus }) {
  switch (status.kind) {
    case "queued":
      return <span className="text-xs text-bone-400">Queued…</span>;
    case "uploading":
      return (
        <div
          role="progressbar"
          aria-valuenow={status.pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
          className="h-1.5 overflow-hidden rounded-full bg-bone-800"
        >
          <div
            className="h-full bg-claude-500 transition-all duration-200"
            style={{ width: `${status.pct}%` }}
          />
        </div>
      );
    case "committing":
      return <span className="text-xs text-bone-400">Finishing…</span>;
    case "done":
      return <span className="text-xs text-emerald-400">Uploaded ✓</span>;
    case "error":
      return (
        <span className="text-xs text-red-300" role="alert">
          {status.message}
        </span>
      );
  }
}
