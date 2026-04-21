import "server-only";
import Replicate from "replicate";
import { isAllowedContentType, putGeneratedImageBytes } from "@/lib/r2";

// Image generation provider abstraction. Today: Replicate with two modes —
// SFW (Flux family by default) and NSFW (an SDXL-family community fine-tune
// like RealVisXL v2). The feature sits behind IMAGE_GENERATION_ENABLED so
// ops can flip it off with an env change. Every entry point (stream route,
// future tool dispatch) must gate on isImageGenerationEnabled() first.
//
// Env vars:
//   IMAGE_GENERATION_ENABLED         "true" to enable; anything else disables
//   REPLICATE_API_TOKEN              required when enabled
//   REPLICATE_DEFAULT_TXT2IMG_MODEL  optional SFW override (default: flux-dev)
//   REPLICATE_NSFW_TXT2IMG_MODEL     optional NSFW override (default: RealVisXL v2)

const DEFAULT_SFW_MODEL = "black-forest-labs/flux-dev";
const DEFAULT_NSFW_MODEL = "lucataco/realvisxl-v2.0";
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

export type GenerateImageMode = "sfw" | "nsfw";

export type GenerateImageInput = {
  prompt: string;
  mode?: GenerateImageMode;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  model?: string;
};

export type GenerateImageResult = {
  publicUrl: string;
  key: string;
  generatedId: string;
  model: string;
  mode: GenerateImageMode;
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

// Model resolution: env overrides win, else mode-defaults apply. An explicit
// `input.model` (passed by a future tool dispatch) beats everything.
function resolveModel(mode: GenerateImageMode, override?: string): string {
  if (override) return override;
  if (mode === "nsfw") {
    return process.env.REPLICATE_NSFW_TXT2IMG_MODEL ?? DEFAULT_NSFW_MODEL;
  }
  return process.env.REPLICATE_DEFAULT_TXT2IMG_MODEL ?? DEFAULT_SFW_MODEL;
}

// SDXL-family models want concrete pixel dimensions rather than aspect_ratio.
// These sizes sum close to 1024² (SDXL's native resolution) which is where
// the model produces its best results.
function aspectToSdxlSize(
  aspect: NonNullable<GenerateImageInput["aspectRatio"]>,
): { width: number; height: number } {
  switch (aspect) {
    case "16:9":
      return { width: 1344, height: 768 };
    case "9:16":
      return { width: 768, height: 1344 };
    case "4:3":
      return { width: 1152, height: 896 };
    case "3:4":
      return { width: 896, height: 1152 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

// BFL's official Flux endpoints are owned by `black-forest-labs/*` and
// always apply BFL's safety filter — there is no way to disable it via
// an input field. We detect them strictly by owner prefix so a community
// fine-tune with "flux" in its name (e.g. `some-user/flux-nsfw-tune`)
// still takes the community code path.
function isBFLFluxModel(model: string): boolean {
  return model.startsWith("black-forest-labs/");
}

// Build the model-specific input object. BFL Flux accepts aspect_ratio +
// output_format; community SDXL-based fine-tunes expect width/height and
// accept a `disable_safety_checker` flag we need set for NSFW output.
//
// Refuses to build an NSFW input for a BFL Flux model — the safety filter
// is enforced server-side by BFL and can't be bypassed; silently serving
// filtered SFW output when the user explicitly asked for NSFW is the
// worst failure mode. If the user wants NSFW, they must point
// REPLICATE_NSFW_TXT2IMG_MODEL at a non-BFL endpoint.
function buildModelInput(
  model: string,
  prompt: string,
  mode: GenerateImageMode,
  aspect: NonNullable<GenerateImageInput["aspectRatio"]>,
): Record<string, unknown> {
  if (mode === "nsfw" && isBFLFluxModel(model)) {
    throw new ImageGenerationError(
      `NSFW mode cannot use a BFL Flux model (${model}) — its safety filter ` +
        "can't be disabled. Set REPLICATE_NSFW_TXT2IMG_MODEL to a community " +
        "SDXL fine-tune (e.g. lucataco/realvisxl-v2.0).",
    );
  }

  if (isBFLFluxModel(model)) {
    return {
      prompt,
      num_outputs: 1,
      aspect_ratio: aspect,
      output_format: DEFAULT_OUTPUT_FORMAT,
    };
  }

  // Community SDXL-family default. Includes disable_safety_checker — SFW
  // on an SDXL tune leaves the flag false (the model's own safety pass
  // still runs); NSFW flips it true so the model's filter gets bypassed.
  // 30 steps is the SDXL quality sweet spot; bump to 40 if users report
  // artifacts.
  const { width, height } = aspectToSdxlSize(aspect);
  return {
    prompt,
    num_outputs: 1,
    width,
    height,
    num_inference_steps: 30,
    scheduler: "K_EULER",
    disable_safety_checker: mode === "nsfw",
  };
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
 * Generate a text-to-image via Replicate, upload bytes to R2, return the
 * public URL. Mode `"sfw"` (default) routes to the SFW model (Flux dev by
 * default); `"nsfw"` routes to a community SDXL fine-tune with the safety
 * checker disabled. Throws ImageGenerationError with a caller-friendly
 * message if the feature is disabled, the token is missing, Replicate
 * fails, or R2 rejects the bytes.
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

  const mode: GenerateImageMode = input.mode ?? "sfw";
  const model = resolveModel(mode, input.model);
  assertModelShape(model);
  const aspectRatio = input.aspectRatio ?? DEFAULT_ASPECT_RATIO;

  const replicate = getReplicate();
  const modelInput = buildModelInput(model, prompt, mode, aspectRatio);

  let output: unknown;
  try {
    output = await replicate.run(model, { input: modelInput });
  } catch (err) {
    throw new ImageGenerationError(
      err instanceof Error ? `Replicate error: ${err.message}` : "Replicate error",
    );
  }

  const { bytes, contentType } = await resolveOutputBytes(output);

  // If Replicate hands back a mime type outside the R2 allowlist, coerce
  // to image/webp. Checking against the real allowlist — not just
  // startsWith("image/") — makes sure the fallback triggers for cases
  // like image/svg+xml / avif / heic that r2 would otherwise reject.
  const storedContentType = isAllowedContentType(contentType)
    ? contentType
    : `image/${DEFAULT_OUTPUT_FORMAT}`;

  const stored = await putGeneratedImageBytes(bytes, storedContentType);

  return {
    publicUrl: stored.publicUrl,
    key: stored.key,
    generatedId: stored.generatedId,
    model,
    mode,
  };
}
