# Trigger.dev setup

One-time setup notes for the Trigger.dev v4 background-job platform.
Adopted 2026-04-29 (PR 0 of the sports data layer series). Replaces
the cron-job.org → `/api/cron/*` HTTP cron pattern for scheduled work.

## Why Trigger.dev

- Durable execution + retries with backoff on transient failures.
- Per-run observability (payloads, errors, latency) in a hosted dashboard.
- Code-colocated schedules (`schedules.task({ cron: "..." })`) live in
  the repo, version-controlled, reviewed in PRs.
- Free tier covers our projected load comfortably — verified
  2026-04-29 against `trigger.dev/pricing`: ~14.5k runs/mo (sports +
  feeds combined) against the $5/mo free credit, ~78% headroom.

## One-time signup (KB)

1. Sign up at <https://trigger.dev>.
2. Create a project named `lazyriverco`. Note the project reference
   (looks like `proj_<random>`). It is **not a secret** and lives in
   `trigger.config.ts`.
3. Replace `TODO_REPLACE_WITH_TRIGGER_PROJECT_REF` in
   `trigger.config.ts` with the real reference. Commit + push.
4. From the Trigger.dev dashboard → API Keys, copy the production
   `TRIGGER_SECRET_KEY` (starts with `tr_prod_`). This **is** a secret.
5. In Railway env vars, set:
   - `TRIGGER_SECRET_KEY=tr_prod_...`
   - `FEEDS_SYNC_ENABLED=` (leave empty / unset for now — flip to
     `true` only after step 7 below).
6. From a local checkout, run:
   ```sh
   pnpm dlx trigger.dev@latest deploy
   ```
   This pushes the tasks defined in `src/trigger/` to Trigger.dev
   cloud. You'll see them register in the dashboard's Tasks list.
7. From the Trigger.dev dashboard → Tasks → `poll-feeds-scheduled`,
   click "Test run" with empty payload. Confirm the run completes
   successfully and ingests new `NewsItem` rows (it will short-circuit
   to "skipped: disabled" until step 8).
8. Once a manual test run is clean, set `FEEDS_SYNC_ENABLED=true` in
   Railway. The scheduled task will fire on the next 15-minute mark.
9. Watch the dashboard for 2–3 scheduled runs in a row. If green:
   delete the cron-job.org entry that was hitting
   `https://lazyriver.co/api/cron/poll-feeds` on a 15-min schedule.
   The HTTP route stays as a manual-trigger fallback.

## Local development

For local task development:

```sh
pnpm dlx trigger.dev@latest dev
```

This connects your local task definitions to the Trigger.dev cloud's
dev environment so you can fire jobs against your local box.
`FEEDS_SYNC_ENABLED` should match your `.env.local`.

## Cost monitoring

Free tier ceiling: $5/mo of usage credit. Overage runs $0.000025/run
+ compute time. Set up an alert in the Trigger.dev dashboard at ~80%
of credit consumption.

If/when 1-day log retention starts hurting post-mortems, upgrade to
Hobby ($10/mo, 7-day retention).

## File map

- `trigger.config.ts` (root) — project ref, runtime, retry defaults.
- `src/trigger/feeds.ts` — RSS feed poller scheduled task. Wraps
  `pollTick()` from `src/lib/feed-tick.ts`.
- `src/lib/feed-tick.ts` — pure-function orchestration. Same logic as
  the manual HTTP fallback at `/api/cron/poll-feeds` calls.
- Future: `src/trigger/sports.ts` — sports score sync tasks (PR 2 of
  the sports data layer series).

## Migration notes

The architectural pattern: **handlers stay pure, task wrappers are
thin.** `pollTick()` takes no transport-specific args, returns a
serializable summary, throws on error. The Trigger.dev task wrapper
in `src/trigger/feeds.ts` adds:
- The `FEEDS_SYNC_ENABLED` master kill-switch check.
- Trigger.dev-specific logging via `logger.info`.
- Task-level retry policy.

Plain `console.error` stays inside `pollTick` — handlers don't import
`@trigger.dev/sdk` directly. If we ever leave Trigger.dev, only the
wrappers need to be rewritten.
