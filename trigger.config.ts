import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev v4 project config. Tasks live in src/trigger/ and are
// auto-discovered.
//
// Setup steps (one-time, KB action — see docs/trigger-dev-setup.md):
//   1. Sign up at trigger.dev, create a "lazyriverco" project.
//   2. Replace the project ref below with the real one (looks like
//      "proj_<random>"). It's not a secret — committed to source.
//   3. In Railway env vars, set TRIGGER_SECRET_KEY (from the project
//      dashboard → API Keys). It IS a secret; do not commit.
//   4. From a local checkout: `pnpm dlx trigger.dev@latest deploy`
//      to push tasks to Trigger.dev cloud.
//
// Until step 2 is done, Trigger.dev CLI commands (deploy/dev) will
// fail with a clear error. The Next.js build is unaffected — this
// file is only read by the Trigger.dev CLI.
//
// Runtime "node-22" matches our package.json `engines.node: >=20`.
// Bumping major node versions in Trigger.dev is a config change, not
// a deploy migration — safe to start here.
export default defineConfig({
  project: "TODO_REPLACE_WITH_TRIGGER_PROJECT_REF",
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
});
