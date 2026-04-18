// Smoke test for the Gemini vision pipeline. Confirms:
//   1. @google/genai SDK imports cleanly
//   2. GOOGLE_GENAI_API_KEY is valid (auth works)
//   3. The model ID we intend to use in P3 accepts image input
//   4. The celebrity-naming behavior is what we expect — the whole
//      reason we picked Gemini over Claude for this pipeline
//
// Run: GOOGLE_GENAI_API_KEY=xxx pnpm exec tsx scripts/smoke-gemini.ts
//
// The test image is a Wikipedia-hosted public-domain photo of Barack
// Obama. If the model names him, we're done. If it refuses or misses,
// we adjust before wiring into the ingest path.

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash";
const TEST_IMAGE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/President_Barack_Obama.jpg/640px-President_Barack_Obama.jpg";

async function main() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_GENAI_API_KEY not set");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  // Fetch the image as bytes — the SDK wants base64 inline data for
  // remote URLs under the Gemini Developer API (vs. Vertex AI, which
  // can take gs:// URIs directly). Wikimedia's CDN requires a UA
  // identifying the caller; default fetch UA gets 429'd.
  const imgRes = await fetch(TEST_IMAGE_URL, {
    headers: {
      "User-Agent": "LazyRiverBot/1.0 (smoke-test; +https://lazyriver.co)",
    },
  });
  if (!imgRes.ok) {
    console.error("failed to fetch test image:", imgRes.status);
    process.exit(1);
  }
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const imgB64 = imgBuf.toString("base64");
  const mime = imgRes.headers.get("content-type") ?? "image/jpeg";

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mime, data: imgB64 } },
          {
            text: "Identify every notable person in this image. Respond with a JSON object: { \"people\": string[], \"tags\": string[] } — `people` = full names (left to right), `tags` = 5 short topical tags. No other text.",
          },
        ],
      },
    ],
  });

  console.log("Model:", MODEL);
  console.log("Response text:");
  console.log(response.text);
}

main().catch((e) => {
  console.error("smoke test failed:", e);
  process.exit(1);
});
