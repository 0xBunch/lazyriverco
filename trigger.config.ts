import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

// Trigger.dev v4 project config. Tasks live in src/trigger/ and are
// auto-discovered.
//
// Project lives under org `based-c2ff`:
//   https://cloud.trigger.dev/orgs/based-c2ff/projects/lazyriverco-G7K2
// The slug in the URL (`lazyriverco-G7K2`) is for human navigation;
// the SDK/CLI uses the canonical ref `proj_kzugnhwlhgjriaibnigb`
// shown below. Neither is a secret. The auth secret is
// `TRIGGER_SECRET_KEY`, set in Railway env vars (from project
// dashboard → API Keys).
//
// Remaining one-time KB actions (see docs/trigger-dev-setup.md):
//   1. Set `TRIGGER_SECRET_KEY=tr_prod_…` in Railway env.
//   2. From a local checkout: `pnpm dlx trigger.dev@latest login`
//      then `… deploy` to push tasks to Trigger.dev cloud.
//   3. Test-run `poll-feeds-scheduled` from the dashboard.
//   4. Once green, set `FEEDS_SYNC_ENABLED=true` in Railway and
//      delete cron-job.org's existing 15-min hit.
//
// Runtime "node-22" matches our package.json `engines.node: >=20`.
// Bumping major node versions in Trigger.dev is a config change, not
// a deploy migration — safe to start here.
export default defineConfig({
  project: "proj_kzugnhwlhgjriaibnigb",
  runtime: "node-22",
  dirs: ["./src/trigger"],
  // Project-wide default — required by Trigger.dev v4. Each task can
  // override per its own needs. Set to 12 minutes here to match the
  // feed-poller's 10-min internal budget plus DB-write slack; sports
  // sync tasks (PR 2+) override this with shorter values.
  maxDuration: 12 * 60,
  // Per-task retry policy lives on each task definition. Global
  // defaults here only set bounds; individual tasks override.
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 60_000,
      factor: 2,
      randomize: true,
    },
  },
  // Prisma build extension — copies the Linux query engine .so.node
  // binary next to the deployed bundle. Without this, the bundler
  // (esbuild) elides the engine and tasks throw
  // PrismaClientInitializationError at runtime even when
  // `binaryTargets = ["native", "debian-openssl-3.0.x"]` is set in
  // schema.prisma. Lesson logged 2026-04-30 — first sync test run
  // returned 11/11 skipped against MLB until both pieces (schema
  // binaryTarget + this extension) were in place.
  build: {
    extensions: [
      prismaExtension({
        mode: "legacy",
        schema: "prisma/schema.prisma",
      }),
    ],
  },
});
