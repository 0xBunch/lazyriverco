import "server-only";
import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { safeFetch, UnsafeUrlError } from "@/lib/safe-fetch";

// R2 presigned-upload helpers. Browser uploads go DIRECT to R2 — server
// never handles file bytes. The server's only role is (1) auth-gate the
// presign request, (2) pick an unguessable object key, (3) sign a short-
// lived PUT URL that the client streams the file body to.
//
// Why PUT, not POST: R2 does not support presigned POST (multipart form
// uploads via HTML forms) — only GET/HEAD/PUT/DELETE. See
// https://developers.cloudflare.com/r2/api/s3/presigned-urls/.
//
// Security hardening:
//   - Content-type allowlist enforced server-side before signing. Clients
//     cannot upload executables, HTML, or anything else.
//   - Content-Type is signed into the URL as a SigV4 signed header, so the
//     client MUST send the exact value — mismatched Content-Type yields
//     403 SignatureDoesNotMatch at R2.
//   - Size cap is enforced in two places:
//       1. Client-side JS rejects oversized files before uploading.
//       2. `assertObjectWithinSize` runs a HEAD against R2 AFTER upload
//          (called from /api/media/commit) and rejects if the stored size
//          exceeds the cap. PUT presigns can't embed a size condition the
//          way POST policies can, so a post-facto check is required.
//   - Presigned URL expires in 5 minutes.
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
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB — avatar-specific cap
export const MAX_SPONSOR_BYTES = 5 * 1024 * 1024; // 5 MB — sponsor banner cap
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

export function newAvatarKey(contentType: string): { avatarId: string; key: string } {
  const avatarId = randomUUID();
  return { avatarId, key: `avatars/${avatarId}.${extensionFor(contentType)}` };
}

export function newSponsorKey(contentType: string): { sponsorMediaId: string; key: string } {
  const sponsorMediaId = randomUUID();
  return { sponsorMediaId, key: `sponsors/${sponsorMediaId}.${extensionFor(contentType)}` };
}

/**
 * Strict regex used by the admin actions to validate that an `imageR2Key`
 * submitted via FormData was minted by `newSponsorKey()` and not pointing at
 * media owned by another feature (avatars, library, generated). Mirror of
 * the security boundary in the avatar flow — see PR C plan §B1.
 */
export const SPONSOR_KEY_REGEX =
  /^sponsors\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

export function isValidSponsorKey(key: string): boolean {
  return SPONSOR_KEY_REGEX.test(key);
}

export function newWagKey(contentType: string): { wagMediaId: string; key: string } {
  const wagMediaId = randomUUID();
  return { wagMediaId, key: `wags/${wagMediaId}.${extensionFor(contentType)}` };
}

/**
 * Same posture as SPONSOR_KEY_REGEX — the admin form submits a WAG
 * imageR2Key via FormData and we want to be sure it was minted by
 * `newWagKey()` rather than re-pointed at media owned by another
 * feature.
 */
export const WAG_KEY_REGEX =
  /^wags\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

export function isValidWagKey(key: string): boolean {
  return WAG_KEY_REGEX.test(key);
}

export function newGeneratedImageKey(contentType: string): { generatedId: string; key: string } {
  const generatedId = randomUUID();
  return { generatedId, key: `generated/${generatedId}.${extensionFor(contentType)}` };
}

export type PresignUploadInput = {
  mimeType: string;
};

export type PresignUploadResult = {
  mediaId: string;
  key: string;
  /** Direct URL the client PUTs the raw file body to. */
  uploadUrl: string;
  /** Stable public URL where the committed object will be readable. */
  publicUrl: string;
  /** The mime type captured at signing — client MUST send this as Content-Type. */
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
  });
  return s3Singleton;
}

/**
 * Presign a direct-to-R2 PUT upload. Validates content-type, generates a
 * server-side key, and returns a signed URL the client can PUT the raw
 * file body to with Content-Type matching `input.mimeType`. Short-lived —
 * re-request if the user takes longer than PRESIGN_EXPIRY_SECONDS to start.
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

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: input.mimeType,
    }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  );

  // Public base has no trailing slash by convention; normalize defensively.
  const base = publicBase.replace(/\/+$/, "");

  return {
    mediaId,
    key,
    uploadUrl,
    publicUrl: `${base}/${key}`,
    contentType: input.mimeType,
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    maxBytes: MAX_UPLOAD_BYTES,
  };
}

// ---------------------------------------------------------------------------
// Avatars: same PUT-presign pattern as media but (a) smaller 2 MB client
// cap, (b) `avatars/` key prefix so images are routable on the public CDN
// under a distinct path, (c) no Media row — caller persists the URL
// directly into Character.avatarUrl. Uploads that never get persisted
// leave orphan R2 objects; acceptable trade-off since keys are UUID-
// guessed and the route is admin-only.

export type PresignAvatarUploadResult = {
  avatarId: string;
  key: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
};

export type PresignSponsorUploadResult = {
  sponsorMediaId: string;
  key: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
};

export type PresignWagUploadResult = {
  wagMediaId: string;
  key: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
};

export async function presignAvatarUpload(
  input: PresignUploadInput,
): Promise<PresignAvatarUploadResult> {
  if (!isAllowedContentType(input.mimeType)) {
    throw new R2UploadError(
      `Content-type "${input.mimeType}" is not in the upload allowlist. Allowed: ${listAllowedContentTypes().join(", ")}`,
    );
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!bucketName || !publicBase) {
    throw new R2UploadError(
      "R2 not configured: set R2_BUCKET_NAME and NEXT_PUBLIC_R2_PUBLIC_BASE_URL before calling presignAvatarUpload.",
    );
  }

  const { avatarId, key } = newAvatarKey(input.mimeType);
  const s3 = getS3Client();

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: input.mimeType,
    }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  );

  const base = publicBase.replace(/\/+$/, "");

  return {
    avatarId,
    key,
    uploadUrl,
    publicUrl: `${base}/${key}`,
    contentType: input.mimeType,
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    maxBytes: MAX_AVATAR_BYTES,
  };
}

/**
 * Presign a sponsor / banner-ad image upload. Scoped to its own
 * `sponsors/<uuid>.<ext>` key prefix so admin-set keys can't pin a
 * sponsor card to media owned by another feature (avatars, library,
 * generated images). Tighter 5 MB cap — banners don't need 25 MB.
 */
export async function presignSponsorUpload(
  input: PresignUploadInput,
): Promise<PresignSponsorUploadResult> {
  if (!isAllowedContentType(input.mimeType)) {
    throw new R2UploadError(
      `Content-type "${input.mimeType}" is not in the upload allowlist. Allowed: ${listAllowedContentTypes().join(", ")}`,
    );
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!bucketName || !publicBase) {
    throw new R2UploadError(
      "R2 not configured: set R2_BUCKET_NAME and NEXT_PUBLIC_R2_PUBLIC_BASE_URL before calling presignSponsorUpload.",
    );
  }

  const { sponsorMediaId, key } = newSponsorKey(input.mimeType);
  const s3 = getS3Client();

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: input.mimeType,
    }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  );

  const base = publicBase.replace(/\/+$/, "");

  return {
    sponsorMediaId,
    key,
    uploadUrl,
    publicUrl: `${base}/${key}`,
    contentType: input.mimeType,
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    maxBytes: MAX_SPONSOR_BYTES,
  };
}

/**
 * Presign a SportsWag image upload. Scoped to its own `wags/<uuid>.<ext>`
 * key prefix so admin-set keys can't pin a WAG row to media owned by
 * another feature. Same 5 MB cap as sponsors — partner photos are
 * editorial covers, not source-sized originals.
 */
export async function presignWagUpload(
  input: PresignUploadInput,
): Promise<PresignWagUploadResult> {
  if (!isAllowedContentType(input.mimeType)) {
    throw new R2UploadError(
      `Content-type "${input.mimeType}" is not in the upload allowlist. Allowed: ${listAllowedContentTypes().join(", ")}`,
    );
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!bucketName || !publicBase) {
    throw new R2UploadError(
      "R2 not configured: set R2_BUCKET_NAME and NEXT_PUBLIC_R2_PUBLIC_BASE_URL before calling presignWagUpload.",
    );
  }

  const { wagMediaId, key } = newWagKey(input.mimeType);
  const s3 = getS3Client();

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: input.mimeType,
    }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  );

  const base = publicBase.replace(/\/+$/, "");

  return {
    wagMediaId,
    key,
    uploadUrl,
    publicUrl: `${base}/${key}`,
    contentType: input.mimeType,
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    maxBytes: MAX_SPONSOR_BYTES,
  };
}

// ---------------------------------------------------------------------------
// Post-upload size guard. Called from /api/media/commit after the client
// reports the PUT succeeded. Runs a HEAD against the R2 object and throws
// R2UploadError if ContentLength exceeds `maxBytes`. This compensates for
// PUT presigns' inability to bake a size cap into the signature — without
// it, an authenticated client with a presigned URL could upload any size
// up to R2's per-object limit.
//
// The HEAD is a Class B op (cheap) and runs once per commit. If R2 returns
// no ContentLength (shouldn't happen for PUTs), treat that as failure.

export async function assertObjectWithinSize(
  key: string,
  maxBytes: number,
): Promise<void> {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new R2UploadError("R2 not configured: set R2_BUCKET_NAME.");
  }
  const s3 = getS3Client();
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: bucketName, Key: key }),
  );
  const size = head.ContentLength;
  if (typeof size !== "number") {
    throw new R2UploadError("R2 HEAD response missing ContentLength.");
  }
  if (size > maxBytes) {
    throw new R2UploadError(
      `Uploaded object is ${size} bytes; exceeds cap of ${maxBytes}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Server-side PUT for AI-generated images. The server holds bytes produced
// by an external image-gen provider (e.g. Replicate) and writes them to R2
// under the `generated/` prefix. No presign flow — the server already has
// the bytes in-process. Content type is validated against the upload
// allowlist so we can't smuggle anything unexpected in from a compromised
// provider response.

export type PutGeneratedImageResult = {
  generatedId: string;
  key: string;
  publicUrl: string;
  contentType: string;
  bytes: number;
};

const MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function putGeneratedImageBytes(
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<PutGeneratedImageResult> {
  if (!isAllowedContentType(contentType)) {
    throw new R2UploadError(
      `Generated image content-type "${contentType}" not in allowlist.`,
    );
  }
  const byteLength = bytes.byteLength;
  if (byteLength > MAX_GENERATED_IMAGE_BYTES) {
    throw new R2UploadError(
      `Generated image is ${byteLength} bytes; exceeds cap of ${MAX_GENERATED_IMAGE_BYTES}.`,
    );
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!bucketName || !publicBase) {
    throw new R2UploadError(
      "R2 not configured: set R2_BUCKET_NAME and NEXT_PUBLIC_R2_PUBLIC_BASE_URL before calling putGeneratedImageBytes.",
    );
  }

  const { generatedId, key } = newGeneratedImageKey(contentType);
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const s3 = getS3Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=604800, immutable",
    }),
  );

  const base = publicBase.replace(/\/+$/, "");
  return {
    generatedId,
    key,
    publicUrl: `${base}/${key}`,
    contentType,
    bytes: byteLength,
  };
}

export async function deleteObject(key: string): Promise<void> {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new R2UploadError("R2 not configured: set R2_BUCKET_NAME.");
  }
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
}

// ---------------------------------------------------------------------------
// Sponsor-banner direct PUT. Used by the AI generation flow (PR D —
// Nano Banana Pro): server fetches generated image bytes from Gemini,
// then drops them under the same `sponsors/<uuid>.<ext>` prefix the
// admin-upload presign flow uses, so the SPONSOR_KEY_REGEX validator in
// actions.ts accepts both upload paths and orphan-cleanup logic stays
// uniform. 5 MB cap matches MAX_SPONSOR_BYTES — Nano Banana outputs are
// well under this in practice.

export type PutSponsorImageResult = {
  sponsorMediaId: string;
  key: string;
  publicUrl: string;
  contentType: string;
  bytes: number;
};

export async function putSponsorImageBytes(
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<PutSponsorImageResult> {
  if (!isAllowedContentType(contentType)) {
    throw new R2UploadError(
      `Sponsor image content-type "${contentType}" not in allowlist.`,
    );
  }
  const byteLength = bytes.byteLength;
  if (byteLength > MAX_SPONSOR_BYTES) {
    throw new R2UploadError(
      `Sponsor image is ${byteLength} bytes; exceeds cap of ${MAX_SPONSOR_BYTES}.`,
    );
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!bucketName || !publicBase) {
    throw new R2UploadError(
      "R2 not configured: set R2_BUCKET_NAME and NEXT_PUBLIC_R2_PUBLIC_BASE_URL before calling putSponsorImageBytes.",
    );
  }

  const { sponsorMediaId, key } = newSponsorKey(contentType);
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const s3 = getS3Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=604800, immutable",
    }),
  );

  const base = publicBase.replace(/\/+$/, "");
  return {
    sponsorMediaId,
    key,
    publicUrl: `${base}/${key}`,
    contentType,
    bytes: byteLength,
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
