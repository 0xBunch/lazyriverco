import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// One-shot bucket classifier for uncategorized tags. Admin-invoked from
// /admin/taxonomy (no auto-fire on creation — see lessons.md:115-118 on
// opt-in AI invocation). One Haiku call covers every uncategorized
// slug at once; returns a {slug -> bucketId | null} map. `null` means
// "ambiguous, leave uncategorized" — we'd rather punt than misfile.
//
// Patterned line-for-line on src/lib/select-context.ts. Same lazy
// singleton, same AbortController timeout, same JSON-fence regex,
// same graceful-degrade-on-error shape. Deliberately no
// usage-tracking wrapper — none exists in this repo (grep-verified).

const CLASSIFY_MODEL = "claude-haiku-4-5" as const;
const CLASSIFY_MAX_TOKENS = 2_000;
const CLASSIFY_TIMEOUT_MS = 5_000;
const MAX_SAMPLE_MEMBERS_PER_BUCKET = 10;

export type BucketForClassify = {
  id: string;
  label: string;
  sampleSlugs: string[];
};

export type ClassifyResult = Map<string, string | null>;

let _classifyClient: Anthropic | null = null;
function getClassifyClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("<")) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  if (!_classifyClient) {
    _classifyClient = new Anthropic({ apiKey });
  }
  return _classifyClient;
}

const CLASSIFY_SYSTEM_PROMPT = `You are a taxonomy classifier for an AI chat platform's tag registry. Your job: assign each input tag slug to the best-matching bucket from a provided list, or return null when no bucket clearly fits.

Rules:
- Return ONLY valid JSON: { "assignments": [{ "slug": "x", "bucketId": "y" }, ...] }
- "bucketId" must be either one of the provided bucket ids, or null (for ambiguous or off-topic slugs)
- Include every input slug in the output exactly once
- Prefer null over a weak guess — uncategorized is safer than miscategorized
- Do NOT include any text outside the JSON object
- Do NOT wrap the JSON in markdown fences`;

function buildBucketPrompt(buckets: BucketForClassify[]): string {
  const lines = buckets.map((b) => {
    const sample =
      b.sampleSlugs.length > 0
        ? b.sampleSlugs.slice(0, MAX_SAMPLE_MEMBERS_PER_BUCKET).join(", ")
        : "(no members yet)";
    return `- [${b.id}] ${b.label}: ${sample}`;
  });
  return ["Available buckets (id, label, sample members):", ...lines].join("\n");
}

/**
 * Classify N tag slugs into the provided buckets using one Haiku call.
 * Returns a Map keyed by every input slug. Values are either a valid
 * bucket id from the input list, or null.
 *
 * Graceful degradation: on any error (missing key, timeout, malformed
 * JSON, hallucinated bucket id) the returned map contains null for
 * every input slug. Callers should treat null as "no change" and keep
 * the tag uncategorized.
 */
export async function classifyTagsIntoBuckets(
  slugs: string[],
  buckets: BucketForClassify[],
): Promise<ClassifyResult> {
  const empty: ClassifyResult = new Map(slugs.map((s) => [s, null]));
  if (slugs.length === 0 || buckets.length === 0) return empty;

  const validBucketIds = new Set(buckets.map((b) => b.id));

  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CLASSIFY_TIMEOUT_MS);

    let response: Anthropic.Message;
    try {
      response = await getClassifyClient().messages.create(
        {
          model: CLASSIFY_MODEL,
          max_tokens: CLASSIFY_MAX_TOKENS,
          temperature: 0,
          system: CLASSIFY_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `${buildBucketPrompt(buckets)}

Input slugs to classify:
${slugs.map((s) => `- ${s}`).join("\n")}`,
            },
          ],
        },
        { signal: abort.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return empty;

    const raw = textBlock.text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[classify-tag-bucket] no JSON in response:", raw);
      return empty;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      assignments?: unknown;
    };
    if (!Array.isArray(parsed.assignments)) return empty;

    const out: ClassifyResult = new Map(slugs.map((s) => [s, null]));
    const inputSlugs = new Set(slugs);
    for (const entry of parsed.assignments) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as { slug?: unknown; bucketId?: unknown };
      if (typeof e.slug !== "string") continue;
      if (!inputSlugs.has(e.slug)) continue;
      if (e.bucketId === null || e.bucketId === undefined) {
        out.set(e.slug, null);
        continue;
      }
      if (typeof e.bucketId !== "string") continue;
      if (!validBucketIds.has(e.bucketId)) continue;
      out.set(e.slug, e.bucketId);
    }
    return out;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(
        `[classify-tag-bucket] Haiku call timed out after ${CLASSIFY_TIMEOUT_MS}ms`,
      );
    } else {
      console.error("[classify-tag-bucket] classify failed:", err);
    }
    return empty;
  }
}
