// One-shot backfill: runs Gemini vision tagging on every Media row that
// hasn't been analyzed yet (aiAnalyzedAt IS NULL). Idempotent — re-runs
// only pick up rows that still have a null timestamp, so a second run
// retries transient failures without re-charging successes.
//
// Usage:
//   pnpm backfill:ai-tags          # process all eligible rows
//   pnpm backfill:ai-tags --limit 20
//   pnpm backfill:ai-tags --dry-run
//
// Requires GOOGLE_GENAI_API_KEY + DATABASE_URL in .env.local (pulled in
// by the `dotenv -e .env.local` wrapper in package.json, matching every
// other db script). Concurrency is low (2) to stay well under the
// Gemini Flash free-tier cap; full-send would just burn through the
// quota and leave the tail marked "skipped: rate-limited".
//
// Failure handling: each row's result is persisted by runVisionTagging
// before the next one starts, so Ctrl+C mid-run is safe — restart and
// it picks up where it left off.

import { prisma } from "@/lib/prisma";
import { runVisionTagging } from "@/lib/ai-tagging-run";

const DEFAULT_CONCURRENCY = 2;
const SYSTEM_USER_ID = "backfill-script";

type Args = {
  limit: number | null;
  dryRun: boolean;
  concurrency: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    limit: null,
    dryRun: false,
    concurrency: DEFAULT_CONCURRENCY,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 1) {
        throw new Error(`--limit needs a positive integer, got "${argv[i]}"`);
      }
      args.limit = v;
    } else if (a === "--concurrency") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 1 || v > 10) {
        throw new Error(`--concurrency must be 1–10, got "${argv[i]}"`);
      }
      args.concurrency = v;
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!process.env.GOOGLE_GENAI_API_KEY) {
    console.error("GOOGLE_GENAI_API_KEY not set. Run via `pnpm backfill:ai-tags`.");
    process.exit(1);
  }

  const rows = await prisma.media.findMany({
    where: {
      aiAnalyzedAt: null,
      type: { not: "link" },
      status: { not: "DELETED" },
      url: { not: "" },
      // Strict image-mime gate — null mimeType (embed-only Twitter/IG
      // rows) would fetch a text/html response and soft-fail, wasting
      // the Gemini call. Only rows with a real image content-type go in.
      mimeType: { startsWith: "image/" },
    },
    orderBy: { createdAt: "desc" },
    take: args.limit ?? undefined,
    select: {
      id: true,
      url: true,
      caption: true,
      originTitle: true,
      originAuthor: true,
      createdAt: true,
    },
  });

  console.log(
    `Found ${rows.length} eligible row${rows.length === 1 ? "" : "s"} (aiAnalyzedAt IS NULL, image-origin).`,
  );
  if (rows.length === 0) {
    await prisma.$disconnect();
    return;
  }

  if (args.dryRun) {
    for (const r of rows.slice(0, 20)) {
      console.log(
        `  ${r.id}  ${r.createdAt.toISOString().slice(0, 10)}  ${r.originTitle?.slice(0, 60) ?? r.caption?.slice(0, 60) ?? "—"}`,
      );
    }
    if (rows.length > 20) console.log(`  … ${rows.length - 20} more`);
    console.log("\n(dry-run) no Gemini calls made, no DB writes.");
    await prisma.$disconnect();
    return;
  }

  console.log(
    `Processing with concurrency=${args.concurrency}. Each call ≤20s. Ctrl+C is safe — restart resumes.\n`,
  );

  let finished = 0;
  let fail = 0;
  const startedAt = Date.now();

  // Small worker pool — pulls the next row off a shared queue. Keeps
  // exactly `concurrency` promises in flight at all times, unlike a
  // Promise.all chunked approach which stalls on the slowest item in
  // each chunk. Progress counter increments on *completion* so the log
  // line "[n/N]" actually means "n done", not "n dispatched".
  const queue = [...rows];
  async function worker(workerId: number): Promise<void> {
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row) return;
      try {
        await runVisionTagging(
          SYSTEM_USER_ID,
          row.id,
          {
            imageUrl: row.url,
            caption: row.caption,
            originTitle: row.originTitle,
            originAuthor: row.originAuthor,
          },
          { skipRateLimit: true },
        );
        const persisted = await prisma.media.findUnique({
          where: { id: row.id },
          select: { aiAnalyzedAt: true, aiAnalysisNote: true, aiTags: true },
        });
        const note = persisted?.aiAnalysisNote;
        const tagCount = persisted?.aiTags.length ?? 0;
        const n = ++finished;
        const label = `[${n}/${rows.length}]`;
        if (note) {
          fail++;
          console.log(`${label} w${workerId} ${row.id}  ✗ ${note}`);
        } else {
          console.log(`${label} w${workerId} ${row.id}  ✓ ${tagCount} tags`);
        }
      } catch (e) {
        fail++;
        const n = ++finished;
        const label = `[${n}/${rows.length}]`;
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`${label} w${workerId} ${row.id}  ✗ threw: ${msg}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: args.concurrency }, (_, i) => worker(i + 1)),
  );

  const elapsedS = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `\nDone. ${rows.length - fail}/${rows.length} tagged, ${fail} soft-failed, ${elapsedS}s elapsed.`,
  );
  console.log(
    "Soft-failed rows have aiAnalysisNote set — query them with:\n" +
      "  SELECT id, \"aiAnalysisNote\" FROM \"Media\" WHERE \"aiAnalysisNote\" IS NOT NULL;",
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("backfill failed:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
