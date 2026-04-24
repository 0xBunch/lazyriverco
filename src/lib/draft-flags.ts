// Feature flag helpers for the MLF Rookie Draft 2026 surface. Mirrors the
// SLEEPER_ENABLED / SLEEPER_PARTNERS_ENABLED pattern — plain env-var string
// check, no external flag service, flipping requires a Railway rebuild.
//
// Gates:
//   * `/sports/mlf/draft-2026` page — returns "not yet open" when false.
//   * `/admin/draft` shell — admin can always reach it (admin-gated higher up),
//     but the "Open draft" action short-circuits when flag is false so nothing
//     goes live accidentally mid-build.
//   * MLF page CTA card for the draft — hidden when flag is false.

export function isDraft2026Enabled(): boolean {
  return process.env.DRAFT_2026_ENABLED === "true";
}
