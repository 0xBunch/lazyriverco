import "server-only";
import { randomUUID } from "crypto";

// R2 presigned-upload helpers. Task 2 ships the public API + content-type
// allowlist + size cap + key generation so the calling code (admin media
// upload flow in Task 8) can be wired up against a stable signature. The
// actual @aws-sdk/client-s3 + @aws-sdk/s3-presigned-post integration
// lands in Task 8 along with the npm install — presignUpload currently
// throws R2UploadError("not implemented") so any accidental call fails
// loudly instead of silently returning a bogus URL.
//
// Security hardening (security-sentinel review, 2026-04-15):
//   - Content-type allowlist enforced server-side before signing. Clients
//     cannot upload executables, HTML, or anything else.
//   - Content-length capped at 25 MB via POST policy Conditions (enforced
//     at R2 ingest — bypasses client-side JS and body limits).
//   - Presigned URL expires in 5 minutes (not the SDK default of 15).
//   - Object keys are generated server-side via crypto.randomUUID().
//     Client-supplied filenames are ignored so enumeration risk is ~122
//     bits and the client can't forge a key to overwrite another object.

const ALLOWED_CONTENT_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
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
    case "video/mp4":
      return "mp4";
    default:
      return "bin";
  }
}

/**
 * Generate the server-side object key for a fresh upload. Called by
 * presignUpload below and by Task 8's /api/media/presign route. Exported
 * so tests can assert key shape.
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

/**
 * Presign a direct-to-R2 upload. Validates content-type, generates a
 * server-side key, and returns the POST URL + fields the client should
 * use. Task 8 fills in the actual createPresignedPost call.
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

  // Suppress the unused-variable warnings until Task 8 fills this in.
  // The signature is final; only the implementation body is TBD.
  void bucketName;

  // TASK 8 —
  //   1. npm install @aws-sdk/client-s3 @aws-sdk/s3-presigned-post
  //   2. Instantiate S3Client at lazy singleton scope against the R2
  //      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
  //   3. Call createPresignedPost with:
  //        Bucket: bucketName,
  //        Key: key,
  //        Expires: PRESIGN_EXPIRY_SECONDS,
  //        Conditions: [
  //          ["content-length-range", 0, MAX_UPLOAD_BYTES],
  //          ["eq", "$Content-Type", input.mimeType],
  //        ],
  //        Fields: { "Content-Type": input.mimeType },
  //   4. Return { uploadUrl: url, fields } from the createPresignedPost
  //      result alongside the other fields below.
  throw new R2UploadError(
    "presignUpload not yet implemented. Task 8 installs @aws-sdk/client-s3 + @aws-sdk/s3-presigned-post and wires createPresignedPost.",
  );
}
