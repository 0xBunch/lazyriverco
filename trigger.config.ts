import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev v4 project config. Tasks live in src/trigger/ and are
// auto-discovered.
//
// Project ref `lazyriverco-G7K2` lives under org `based-c2ff`:
//   https://cloud.trigger.dev/orgs/based-c2ff/projects/lazyriverco-G7K2
// The ref is not a secret. The auth secret is `TRIGGER_SECRET_KEY`,
// set in Railway env vars (from project dashboard → API Keys).
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
  project: "lazyriverco-G7K2",
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
