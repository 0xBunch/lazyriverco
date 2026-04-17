import "server-only";
import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { safeFetch, UnsafeUrlError } from "@/lib/safe-fetch";

// R2 presigned-upload helpers. Browser uploads go DIRECT to R2 — server
// never handles file bytes. The server's only role is (1) auth-gate the
// presign request, (2) pick an unguessable object key, (3) sign a short-
// lived POST with content-type + content-length constraints baked in.
//
// Security hardening:
//   - Content-type allowlist enforced server-side before signing. Clients
//     cannot upload executables, HTML, or anything else.
//   - Content-length capped at 25 MB via POST policy Conditions (enforced
//     at R2 ingest — bypasses client-side JS and body limits).
//   - Presigned URL expires in 5 minutes (not the SDK default of 15).
//   - Object keys are generated server-side via crypto.randomUUID().
//     Client-supplied filenames are ignored so enumeration risk is ~122
//     bits and the client can't forge a key to overwrite another object.
//
// Scope note: video uploads are intentionally out of scope. Video support
// on the site is URL embeds only (YouTube/Vimeo) — no mp4 in the allowlist.

const ALLOWED_CONTENT_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
export const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes

export function isAllowedContentType(mimeType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(mimeType);
}

export function listAllowedContentTypes(): readonly string[] {
  return [...ALLOWED_CONTENT_TYPES];
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/**
 * Generate the server-side object key for a fresh upload. Exported so
 * tests can assert key shape.
 */
export function newMediaKey(contentType: string): { mediaId: string; key: string } {
  const mediaId = randomUUID();
  return { mediaId, key: `media/${mediaId}.${extensionFor(contentType)}` };
}

export type PresignUploadInput = {
  mimeType: string;
};

export type PresignUploadResult = {
  mediaId: string;
  key: string;
  /** Direct URL the client POSTs the FormData to. */
  uploadUrl: string;
  /** Fields the client must include in the FormData BEFORE the `file` field. */
  fields: Record<string, string>;
  /** Stable public URL where the committed object will be readable. */
  publicUrl: string;
  /** The mime type captured at signing — persisted to Media.mimeType. */
  contentType: string;
  expiresIn: number;
  maxBytes: number;
};

export class R2UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2UploadError";
  }
}

// Lazy singleton — we don't want to crash at module import time on local
// dev machines that haven't set the R2 env yet. Callers of presignUpload
// will get a clear R2UploadError instead.
let s3Singleton: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Singleton) return s3Singleton;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new R2UploadError(
      "R2 credentials missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY before calling presignUpload.",
    );
  }

  s3Singleton = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // Force path-style because R2's presigned POSTs work against the
    // bucket endpoint, and signature v4 for POST policies is what
    // createPresignedPost emits — leave SDK defaults otherwise.
  });
  return s3Singleton;
}

/**
 * Presign a direct-to-R2 upload. Validates content-type, generates a
 * server-side key, and returns the POST URL + fields the client should
 * use. The returned URL is short-lived; re-request if the user takes
 * longer than PRESIGN_EXPIRY_SECONDS to start the upload.
 */
export async function presignUpload(
  input: PresignUploadInput,
): Promise<PresignUploadResult> {
  if (!isAllowedContentType(input.mimeType)) {
    throw new R2UploadError(
      `Content-type "${input.mimeType}" is not in the upload allowlist. Allowed: ${listAllowedContentTypes().join(", ")}`,
    );
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!bucketName || !publicBase) {
    throw new R2UploadError(
      "R2 not configured: set R2_BUCKET_NAME and NEXT_PUBLIC_R2_PUBLIC_BASE_URL before calling presignUpload.",
    );
  }

  const { mediaId, key } = newMediaKey(input.mimeType);
  const s3 = getS3Client();

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: bucketName,
    Key: key,
    Expires: PRESIGN_EXPIRY_SECONDS,
    Conditions: [
      ["content-length-range", 0, MAX_UPLOAD_BYTES],
      ["eq", "$Content-Type", input.mimeType],
    ],
    Fields: {
      "Content-Type": input.mimeType,
    },
  });

  // Public base has no trailing slash by convention; normalize defensively.
  const base = publicBase.replace(/\/+$/, "");

  return {
    mediaId,
    key,
    uploadUrl: url,
    fields,
    publicUrl: `${base}/${key}`,
    contentType: input.mimeType,
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    maxBytes: MAX_UPLOAD_BYTES,
  };
}

// ---------------------------------------------------------------------------
// Server-side copy: fetch a remote URL (OG image, YouTube thumbnail) and
// PUT the bytes to R2. Used by the ingest layer (src/lib/ingest/index.ts)
// to localize thumbnails so a grid tile keeps working even if the source
// rotates or deletes the image. Separate from presignUpload because this
// path holds bytes in the server process transiently — tighter cap and
// timeout than the direct-upload flow.

export type CopyRemoteResult = {
  mediaId: string;
  key: string;
  publicUrl: string;
  contentType: string;
  bytes: number;
};

const COPY_REMOTE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — smaller than MAX_UPLOAD_BYTES because server buffers
const COPY_REMOTE_TIMEOUT_MS = 8000;
const COPY_REMOTE_UA = "LazyRiverBot/1.0 (+https://lazyriver.co)";

/**
 * Fetch a remote image URL and put it into R2. Returns the new R2 key +
 * public URL, or throws R2UploadError / IngestError-shaped errors. Content
 * type is validated against the same allowlist as user uploads.
 *
 * Failure modes the caller should expect to handle:
 *   - network timeout / non-2xx   → falls back to referencing remote URL
 *   - disallowed content type     → same fallback (don't copy weird stuff)
 *   - body too large              → same fallback
 *   - R2 put failure              → same fallback
 * In every failure case the caller should store `storedLocally=false` and
 * keep the remote URL as `ogImageUrl`. We return a *successful* copy when
 * it's cleanly possible, nothing fancier.
 */
export async function copyRemoteToR2(
  remoteUrl: string,
  preferredContentType?: string,
): Promise<CopyRemoteResult> {
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!bucketName || !publicBase) {
    throw new R2UploadError(
      "R2 not configured: set R2_BUCKET_NAME and NEXT_PUBLIC_R2_PUBLIC_BASE_URL before calling copyRemoteToR2.",
    );
  }

  // safeFetch handles SSRF guard + manual redirect re-validation + timeout.
  // Any UnsafeUrlError becomes an R2UploadError so the caller falls back
  // to referencing the remote URL without copying (storedLocally=false).
  let res: Response;
  try {
    res = await safeFetch(remoteUrl, {
      timeoutMs: COPY_REMOTE_TIMEOUT_MS,
      accept: "image/*",
      userAgent: COPY_REMOTE_UA,
    });
  } catch (e) {
    if (e instanceof R2UploadError) throw e;
    if (e instanceof UnsafeUrlError) {
      throw new R2UploadError(e.message);
    }
    throw new R2UploadError(
      e instanceof Error ? e.message : "Remote fetch failed.",
    );
  }

  const contentType = (res.headers.get("content-type") ?? preferredContentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!isAllowedContentType(contentType)) {
    throw new R2UploadError(`Remote content-type "${contentType}" not in allowlist.`);
  }

  const lengthHeader = res.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > COPY_REMOTE_MAX_BYTES) {
    throw new R2UploadError("Remote body too large to copy.");
  }

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > COPY_REMOTE_MAX_BYTES) {
    throw new R2UploadError("Remote body exceeded size cap after streaming.");
  }

  const { mediaId, key } = newMediaKey(contentType);
  const s3 = getS3Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: new Uint8Array(buffer),
      ContentType: contentType,
      // Cache-Control: remote images rarely change at a given URL; a week
      // is a reasonable default since we're essentially snapshotting.
      CacheControl: "public, max-age=604800, immutable",
    }),
  );

  const base = publicBase.replace(/\/+$/, "");

  return {
    mediaId,
    key,
    publicUrl: `${base}/${key}`,
    contentType,
    bytes: buffer.byteLength,
  };
}
