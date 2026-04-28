import "server-only";
import { GoogleGenAI } from "@google/genai";
import {
  isAllowedContentType,
  putSponsorImageBytes,
  type PutSponsorImageResult,
} from "@/lib/r2";

// Sponsor banner generation via Gemini 2.5 Flash Image (Nano Banana Pro).
//
// Cost (per CLAUDE.md AI API check):
//   - Model:    gemini-2.5-flash-image
//   - Pricing:  ~$0.039 per generated image (verify live)
//   - Volume:   admin-triggered, very low cadence
//   - Monthly:  ~$1–$2 even at 50 generations/month
//   - Controls: requireAdmin() + assertWithinLimit() at the route layer;
//               this module trusts callers and just makes the API call.
//
// The model returns the image as base64-encoded `inlineData` on a part
// inside the first candidate. We take the first such part, decode to
// bytes, and pipe straight to R2 under the existing `sponsors/<uuid>.<ext>`
// prefix so the same SPONSOR_KEY_REGEX validator and orphan-cleanup
// logic in actions.ts apply uniformly to uploaded and AI-generated
// banners.

const MODEL = "gemini-2.5-flash-image";

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    throw new SponsorImageGenError(
      "GOOGLE_GENAI_API_KEY is not set — AI generation is unavailable.",
    );
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export class SponsorImageGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SponsorImageGenError";
  }
}

export type GenerateSponsorBannerInput = {
  /// Free-form prompt as typed by the admin. Passed through raw — no
  /// style suffix or system prompt — so the admin keeps full control
  /// over tone and content.
  prompt: string;
};

/// Synchronous (5–15s typical) call. On success returns the new R2
/// object's key + public URL — the caller is expected to persist the
/// key on the SportsSponsor row. Throws SponsorImageGenError on:
///   - missing API key (server-misconfigured)
///   - the model returning text-only with no inlineData part
///   - an inlineData mimeType outside our allowlist
///   - the R2 upload failing
export async function generateSponsorBannerImage(
  input: GenerateSponsorBannerInput,
): Promise<PutSponsorImageResult & { prompt: string }> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new SponsorImageGenError("Prompt is empty.");
  }

  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(
    (p): p is { inlineData: { data: string; mimeType: string } } =>
      typeof p?.inlineData?.data === "string" &&
      typeof p?.inlineData?.mimeType === "string",
  );

  if (!imagePart) {
    // Gemini occasionally returns a refusal as a text-only part. Surface
    // the text if present so the admin sees what the model said.
    const refusal = parts
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    throw new SponsorImageGenError(
      refusal
        ? `Gemini did not produce an image. It said: "${refusal.slice(0, 240)}"`
        : "Gemini did not produce an image. Try a different prompt.",
    );
  }

  const mimeType = imagePart.inlineData.mimeType;
  if (!isAllowedContentType(mimeType)) {
    throw new SponsorImageGenError(
      `Generated image content-type "${mimeType}" is not in the allowlist.`,
    );
  }

  const bytes = Buffer.from(imagePart.inlineData.data, "base64");
  const stored = await putSponsorImageBytes(bytes, mimeType);

  return { ...stored, prompt };
}
