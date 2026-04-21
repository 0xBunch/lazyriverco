import "server-only";
import Replicate from "replicate";
import { isAllowedContentType, putGeneratedImageBytes } from "@/lib/r2";

// Image generation provider abstraction. Today: Replicate + Flux schnell,
// SFW default. The feature sits behind IMAGE_GENERATION_ENABLED so ops can
// flip it off with an env change + redeploy if the integration misbehaves
// in prod. Every other entry point (stream route, future tool dispatch)
// must gate on isImageGenerationEnabled() before calling through.
//
// Env vars read here (none required except when the feature is on):
//   IMAGE_GENERATION_ENABLED       "true" to enable; anything else disables
//   REPLICATE_API_TOKEN            required when enabled
//   REPLICATE_DEFAULT_TXT2IMG_MODEL optional override; default below

const DEFAULT_MODEL = "black-forest-labs/flux-schnell";
const DEFAULT_OUTPUT_FORMAT = "webp" as const;
const DEFAULT_ASPECT_RATIO = "1:1" as const;

export class ImageGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageGenerationError";
  }
}

export function isImageGenerationEnabled(): boolean {
  // Normalize so a misformatted Railway/.env value like "True" or " true "
  // doesn't silently leave the feature off.
  return (
    process.env.IMAGE_GENERATION_ENABLED?.toLowerCase().trim() === "true"
  );
}

// Replicate model identifiers are "owner/name" or "owner/name:versionId".
// When the env override is set wrong this assertion gives a readable error
// instead of a generic Replicate 400.
function assertModelShape(m: string): asserts m is `${string}/${string}` {
  if (!/^[^/\s]+\/[^/\s:]+(?::[A-Za-z0-9]+)?$/.test(m)) {
    throw new ImageGenerationError(
      `Invalid Replicate model identifier: "${m}". Expected "owner/name" or "owner/name:version".`,
    );
  }
}

export type GenerateImageInput = {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  model?: string;
};

export type GenerateImageResult = {
  publicUrl: string;
  key: string;
  generatedId: string;
  model: string;
};

// Replicate client is lazy so module import doesn't crash when the token
// isn't set (e.g. local dev with the flag off).
let replicateSingleton: Replicate | null = null;

function getReplicate(): Replicate {
  if (replicateSingleton) return replicateSingleton;
  const auth = process.env.REPLICATE_API_TOKEN;
  if (!auth) {
    throw new ImageGenerationError(
      "REPLICATE_API_TOKEN is not set. Add it to .env.local / Railway env.",
    );
  }
  replicateSingleton = new Replicate({ auth });
  return replicateSingleton;
}

// Normalize Replicate SDK v1 output. `replicate.run()` may return:
//   - FileOutput[] (array of stream-like objects with .blob())
//   - string[]     (legacy array of URLs)
//   - string       (single URL)
//   - FileOutput   (single stream-like object)
// In all cases we need raw bytes + a content type we can store in R2.
async function resolveOutputBytes(
  output: unknown,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const first = Array.isArray(output) ? output[0] : output;

  if (!first) {
    throw new ImageGenerationError("Replicate returned empty output.");
  }

  // FileOutput has a .blob() method in v1.
  if (
    typeof first === "object" &&
    first !== null &&
    "blob" in first &&
    typeof (first as { blob: unknown }).blob === "function"
  ) {
    const blob = await (first as { blob: () => Promise<Blob> }).blob();
    return {
      bytes: await blob.arrayBuffer(),
      contentType: blob.type || `image/${DEFAULT_OUTPUT_FORMAT}`,
    };
  }

  // URL string (legacy SDK or model that returns URLs directly).
  const url = typeof first === "string" ? first : String(first);
  const res = await fetch(url);
  if (!res.ok) {
    throw new ImageGenerationError(
      `Replicate output fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || `image/${DEFAULT_OUTPUT_FORMAT}`,
  };
}

/**
 * Generate an SFW text-to-image via Replicate + Flux schnell (default), upload
 * the bytes to R2, and return the public URL. Throws ImageGenerationError
 * with a caller-friendly message if the feature is disabled, the token is
 * missing, Replicate fails, or R2 rejects the bytes.
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  if (!isImageGenerationEnabled()) {
    throw new ImageGenerationError("Image generation is disabled.");
  }
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new ImageGenerationError("Prompt is required.");
  }

  const model =
    input.model ??
    process.env.REPLICATE_DEFAULT_TXT2IMG_MODEL ??
    DEFAULT_MODEL;
  assertModelShape(model);
  const aspectRatio = input.aspectRatio ?? DEFAULT_ASPECT_RATIO;

  const replicate = getReplicate();

  let output: unknown;
  try {
    output = await replicate.run(model, {
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: aspectRatio,
        output_format: DEFAULT_OUTPUT_FORMAT,
      },
    });
  } catch (err) {
    throw new ImageGenerationError(
      err instanceof Error ? `Replicate error: ${err.message}` : "Replicate error",
    );
  }

  const { bytes, contentType } = await resolveOutputBytes(output);

  // If Replicate hands back a mime type outside the R2 allowlist (image/svg+xml,
  // image/avif, image/heic, etc.), coerce to image/webp since we explicitly
  // requested webp output. Checking against the real allowlist — not just
  // startsWith("image/") — makes sure the fallback triggers for the cases
  // that would otherwise fail at the r2 layer.
  const storedContentType = isAllowedContentType(contentType)
    ? contentType
    : `image/${DEFAULT_OUTPUT_FORMAT}`;

  const stored = await putGeneratedImageBytes(bytes, storedContentType);

  return {
    publicUrl: stored.publicUrl,
    key: stored.key,
    generatedId: stored.generatedId,
    model,
  };
}
