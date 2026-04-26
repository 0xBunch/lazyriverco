# MLF Rookie Draft 2026 — Feature Documentation

The Mens League of Football (MLF) rookie draft replaces last year's email-thread
workflow with a full in-app draft room. It runs async over multiple days, opens
*after* the NFL Draft wraps (so the rookie pool is real), and is built around a
broadcast aesthetic — Clash Display + Satoshi typography, navy/red/cream MLF
shield identity, a "Goodell box" announcement card on every locked pick, and AI
flavor (scouting reports + announcer pick reactions).

> **Naming rule:** "Mens" never takes an apostrophe. MLF = **Mens League of
> Football** (F is Football, not Fantasy).

---

## 1. Routes at a glance

### Public

| Path | Purpose |
|------|---------|
| `/sports/mlf/draft-2026` | The live draft room. Auth-gated. Renders one of: `not-yet-open`, `setup`, `live`, `paused`, `complete`. |
| `/sports/mlf/draft-2026/ClockCountdown.tsx` | The only client component on the public page — ticks the on-clock countdown locally so it doesn't need polling. |
| `/mockup/draft-2026` | Frozen design reference (HTML/Tailwind mockup at desktop viewport). Not connected to live data. |

### Admin

| Path | Purpose |
|------|---------|
| `/admin/draft` | List + create + delete drafts. |
| `/admin/draft/[id]` | Single-draft cockpit: status toggle (open / pause / resume / complete), reset, delete. |
| `/admin/draft/[id]/setup` | Slots, manager assignment, shadow managers, shadow pre-seed picks, team names, clock duration. |
| `/admin/draft/[id]/pool` | Rookie pool: seed from Sleeper, manually add/remove players, soft-delete with `removed=true`. |
| `/admin/draft/[id]/images` | Goodell-box image pool: upload to R2, delete, reset rotation (clear `consumedPickId`). |
| `/admin/draft/[id]/sponsors` | "Presented By" sponsor cards: name, tagline, image, link, display order, active flag. |

There are **no `/api/draft/**` endpoints**. The original plan called for them;
the implementation uses Next.js server actions throughout (simpler, no extra
auth middleware, free CSRF protection via Next).

The two API routes that do touch the draft are inherited from the broader
Sleeper integration: `POST /api/sleeper` runs a players sync (pulls
`years_exp`, `draft_year`, `team` for the rookie filter), and the partner-image
endpoints aren't draft-specific.

---

## 2. Data model

All Draft* models live in `prisma/schema.prisma`. Two migrations:

- `20260424160000_draft_2026_foundation` — adds `SleeperPlayer.yearsExp`,
  `SleeperPlayer.draftYear`, and the seven core Draft* tables.
- `20260424210000_shadow_managers` — adds `DraftSlot.isShadow` and the
  `DraftShadowPick` table.

```
SleeperPlayer (existing)
  + yearsExp Int?
  + draftYear Int?
  + index (yearsExp, position, team) — feeds the rookie filter

DraftRoom
  id, slug, name, season, totalRounds, totalSlots, snake,
  status ("setup"|"live"|"paused"|"complete"),
  pickClockSec, openedAt, closedAt, createdBy

DraftSlot
  draftId, slotOrder (1..N), userId, teamName, isShadow

DraftPick
  draftId, round, pickInRound, overallPick (unique per draft),
  slotId, userId, playerId?, status ("pending"|"onClock"|"locked"),
  onClockAt?, lockedAt?, lockedById?, undoneAt?

DraftPoolPlayer
  draftId, playerId, addedBy, removed (soft-delete), note

DraftShadowPick
  draftId, slotId, round, playerId, addedBy
  unique (draftId, slotId, round)

DraftAnnouncerImage
  draftId, r2Key, label?, uploadedBy,
  consumedPickId? — set when this image fires for a pick;
                   supports without-replacement rotation

DraftSponsor
  draftId, name, tagline, imageR2Key?, linkUrl?, displayOrder, active

RookieScoutingReport
  playerId (unique), body, voice, model, createdAt

DraftPickReaction
  draftPickId (unique), body, characterId?, model, createdAt
```

**Key invariants:**

- `DraftPick.overallPick` is unique per draft and is the source of truth for
  pick order. Snake math runs once at `openDraft` time and never re-runs.
- `DraftAnnouncerImage.consumedPickId` is the rotation cursor — null = unused,
  non-null = bound to a specific pick.
- A user can shadow-manage a slot without a real account: `User.passwordHash`
  is nullable, and `setup/actions.ts::createShadowUser` writes a User row with
  `name=shadow-<uuid>`, `email=null`, `passwordHash=null`, `role=MEMBER`. Auth
  flow tolerates null passwordHash (login simply fails for shadows, which is
  correct).

---

## 3. Server actions

### Public — `src/app/(portal)/sports/mlf/draft-2026/actions.ts`

| Action | What it does |
|--------|--------------|
| `lockPick(fd)` | Locks the on-clock pick to a chosen player. Auth-gated (must be the on-clock user OR admin). Pool-guarded (player must be in the draft's pool, not removed). One transaction: lock pick → consume a random unused announcer image → advance via `findNextPendingPick`. Fires `generateDraftPickReaction` async post-commit. |

### Admin — `src/app/(portal)/admin/draft/actions.ts`

| Action | What it does |
|--------|--------------|
| `createDraft(fd)` | Creates a fresh DraftRoom in `status=setup`. |
| `deleteDraft(fd)` | Hard-deletes a draft and all related rows (cascade). Gated by typing literal "DELETE". |

### Admin — `src/app/(portal)/admin/draft/[id]/actions.ts`

| Action | What it does |
|--------|--------------|
| `openDraft(fd)` | Flips `setup → live`. Materializes the full N×M grid of DraftPick rows with `computeSnakeOrder`, applies any DraftShadowPick pre-seeds as `status=locked`, picks the earliest pending overallPick as the initial `onClock`, fires shadow-pick reactions async. Idempotent: refuses if `status≠setup` or if picks already exist. |
| `pauseDraft(fd)` | `live → paused`. |
| `resumeDraft(fd)` | `paused → live`. |
| `completeDraft(fd)` | `live → complete` + sets `closedAt`. |
| `resetDraft(fd)` | Wipes DraftPick rows (cascades reactions), nulls `consumedPickId` on all images, resets DraftRoom to `status=setup` with `openedAt=null`/`closedAt=null`. **Preserves** slots, pool, sponsors, images, shadow picks, scouting reports. Gated by typing literal "RESET". |

### Admin — subdir actions

- **`setup/actions.ts`** — `createShadowUser` (display-name → User row),
  `saveSlots` (writes DraftSlot rows; handles `isShadow` flag and round-by-round
  shadow-pick selection in one form submit; deletes orphan shadow picks).
- **`pool/actions.ts`** — `seedPool` (calls `seedRookiePool` and surfaces a
  diagnostic breakdown: matches by `draftYear`, by `yearsExp`, with team,
  without team), `addPlayerToPool`, `togglePlayerRemoved`.
- **`images/actions.ts`** — `uploadAnnouncerImage` (server-side R2 PUT via
  `putGeneratedImageBytes`), `deleteAnnouncerImage`, `resetRotation` (nulls
  `consumedPickId` on every image so the rotation pool is whole again).
- **`sponsors/actions.ts`** — `addSponsor`, `toggleSponsorActive`,
  `deleteSponsor`, `reorderSponsor`.

All admin actions use the same flash-redirect pattern:
`flash(path, "msg"|"error", value)` writes a query param and `redirect`s back
to the page so the result is visible. `requireAdmin()` gates every action;
the admin shell layout double-gates at the layout level.

---

## 4. Pure helpers — `src/lib/draft.ts`

| Export | Notes |
|--------|-------|
| `computeSnakeOrder(totalSlots, totalRounds, snake?)` | Pure function. Returns the full `{round, pickInRound, overallPick, slotOrder}[]` sequence. Snake math runs here and only here — change it and round 2+ shifts. Has explicit round-2-reversal tests in spirit (not unit-tested in code yet). |
| `ordinalPick(n)` | English ordinals 1–32 (`first`..`thirty-second`). Falls back to `Nth` past 32. Used in the Goodell caption template. |
| `formatCaption({overallPick, slotTeamName, slotManagerDisplay, playerFullName, playerNflTeam})` | "With the sixth pick in the MLF Draft, the Austin Bats select Fernando Mendoza, Las Vegas Raiders." Falls back to "{Manager} selects" when no team name. |
| `isOnClockFor(userId, pick)` | Boolean: is this user actually on the clock right now? Returns false for admins viewing someone else's turn. |
| `seedRookiePool(prisma, draftId, seededBy)` | Filter: `(draftYear=<DraftRoom.season> OR yearsExp=0) AND position IN [QB,RB,WR,TE] AND active=true`. Drops the team-required filter so UDFAs and post-draft-window rookies are caught. Returns `{inserted, matched, breakdown}` with a per-signal count. |
| `findNextPendingPick(prisma, draftId)` | Lowest `overallPick` where `status=pending`. Used for the initial on-clock at openDraft and for advancement at lockPick. Skips over pre-locked shadow picks naturally. |

`src/lib/draft-flags.ts` is a one-liner: `isDraft2026Enabled()` reads
`DRAFT_2026_ENABLED` env. Page returns the "not yet open" skeleton when off.

---

## 5. AI pipelines — `src/lib/sleeper-ai.ts`

Two new generators bolt onto the existing Claude Sonnet 4.6 + DB-cache +
single-flight pattern.

### `generateRookieScoutingReport(playerId, opts?)`

- ~150 words: strengths, weaknesses, team fit, fantasy outlook.
- `max_tokens: 350`, single-flight in-module lock keyed by `playerId`.
- Cached in `RookieScoutingReport` (unique on `playerId`).
- Prompt-injection envelope: all player data wrapped in
  `<player_data untrusted="true">…</player_data>`.
- Currently fired lazily from the dossier panel UI (not yet wired in v1 —
  the page surfaces the cached body if present).

### `generateDraftPickReaction(draftPickId)`

- 1–2 punchy "MLF draft announcer" sentences. Spicy + funny voice.
- `max_tokens: 120`, single-flight keyed by `draftPickId`.
- Cached in `DraftPickReaction` (unique on `draftPickId`).
- Inputs: the pick, the picker's prior picks, top-5 best-available by ADP,
  round context, the player's NFL team and position.
- Prompt-injection envelope on every user-controlled string.
- Fired from `lockPick()` and from `openDraft()` for shadow pre-seeds:
  `void generateDraftPickReaction(pickId).catch(log)` — non-blocking.
  UI re-renders on next polling tick (or page reload) and shows the body.

**Cost note:** Sonnet 4.6 at the configured token caps runs well under $0.20
total for ~100 scouting reports + ~24 reactions per draft.

---

## 6. The Goodell box

The "Goodell box" is the announcement card that fires on every lock — image +
auto-caption, like Roger Goodell stepping to the podium.

**Mechanics:**

1. **Pre-upload (admin).** `/admin/draft/[id]/images` — admin uploads ~30+
   images to R2 (prefix `draft/{draftId}/...`). Each becomes a
   `DraftAnnouncerImage` row with `consumedPickId=null`.
2. **On lock.** `lockPick()` (and `openDraft()` for shadow pre-seeds) picks
   one random `consumedPickId IS NULL` image, sets `consumedPickId` to the
   newly locked pick's id, all in the same transaction. Without-replacement
   rotation: each image fires once until the pool is exhausted.
3. **Display.** The page reads the image's R2 key + builds the caption from
   `formatCaption()` for each locked pick. No image left? Falls back to a
   text-only "league seal" treatment so the announcement still fires.
4. **Reset.** `resetRotation` (admin button on the images page) nulls every
   `consumedPickId` so the pool is whole again. Useful for dry runs.

The rotation is **draft-scoped**: images uploaded to draft A don't leak into
draft B.

---

## 7. Shadow managers

The 8th MLF team (OORFV, managed in real life by Joey, who doesn't have a
lazyriverco account) is shadow-managed by KB. The system needs to advance past
OORFV's turns automatically without a real on-clock action.

**Flow:**

1. Admin clicks **Add shadow manager → "Joey"** on the setup page.
   `createShadowUser` writes a User row: `name=shadow-<uuid>`,
   `displayName="Joey"`, `passwordHash=null`, `email=null`, `role=MEMBER`.
2. Admin assigns slot 8 to Joey, ticks **Shadow slot?**, expands the foldout,
   and picks a player for each round (the picker is searchable, sourced from
   the rookie pool). `saveSlots` writes `DraftSlot.isShadow=true` and upserts
   `DraftShadowPick` rows — one per `(slotId, round)`.
3. **At openDraft time:** the materialization loop fetches all
   `DraftShadowPick` rows for the draft, indexes them by `(slotId, round)`,
   and for any matching pick emits the create row as `status=locked` with
   `playerId` + `lockedAt=now` + `lockedById=<admin who opened>`.
4. **First on-clock:** `findNextPendingPick` returns the lowest pending
   `overallPick` — i.e., the first pick that *isn't* a shadow pre-seed. In a
   normal-slot-1 draft that's `1.01`. If slot 1 were shadow, it'd be `1.02`.
5. **Advancement at lockPick time:** also via `findNextPendingPick`, so the
   live draft naturally skips over pre-locked shadow picks. No special-case
   code in `lockPick`.
6. **Goodell + reactions for shadow picks:** treated identically to real
   picks. Each shadow pre-seed consumes an announcer image during the open
   transaction; reactions fire async after commit. (Spicy AI on a ridiculous
   pick = bonus comedy.)

**Constraints:**

- One shadow user per slot is the v1 expectation. `DraftSlot` is unique on
  `(draftId, userId)`, so reusing the same shadow user across multiple slots
  in the same draft is blocked.
- Replacing shadow picks after open requires `resetDraft` + re-setup. v2
  could add per-pick unlock; out of scope.
- `DraftShadowPick` is unique on `(draftId, slotId, round)`, so it scales to
  any `totalRounds` value (not hardcoded to 3).

---

## 8. Pick clock

`ClockCountdown.tsx` is the only client component on the public page. It
ticks locally on a 1s interval, renders `HH : MM : SS` with breathing colons
(opacity 0.35 → 1, respects `prefers-reduced-motion`).

**Two modes:**

1. **Default (data-driven).** Deadline = `onClockAt + pickClockSec * 1000`.
2. **Override (`deadlineAt` prop).** When set, takes precedence over the
   computed deadline.

The page currently passes a computed `deadlineAt` from `nextElevenAmCentral()`
— a server-side helper that always returns *tomorrow at 11:00 America/Chicago*
(DST-aware: CDT in April, CST in winter). This pins the visible clock to the
soft daily MLF cadence rather than a strict 24h-from-onClock window.

To change the target time/day, edit `nextElevenAmCentral()` near the top of
`src/app/(portal)/sports/mlf/draft-2026/page.tsx`.

---

## 9. Mobile responsive

Stage 1 quick-wins shipped: every section of the public page has `md:`-prefixed
overrides so desktop is pixel-identical at ≥768px and the phone layout is
usable. Highlights:

- Hero stacks shield + title vertically; title goes `text-[44px] md:text-[108px]`.
- StatusRow grid collapses to single column; OnClockPanel fields wrap.
- BigBoard rows go from 5-col to 2-col (rank+name | LOCK PICK) with POS·NFL
  inline beneath the name. LOCK PICK gets a ≥44×44px touch target.
- DraftBoard snake grid horizontal-scrolls on mobile with a swipe hint.
- GoodellBox stacks image-above-caption.
- Skeleton states (NotYetOpen / SetupInProgress / Complete) shrink the hero
  shield and title.

Stage 2 (phone-native: bottom-sticky LOCK PICK CTA, full-screen "your turn"
interstitial, swipeable rounds, PWA install) is deferred. It's an
architectural treatment and will route through `design-oracle` before any
code.

---

## 10. Operational runbook

### One-time setup before opening the draft

1. **Sync players from Sleeper.** Refreshes `years_exp`, `draft_year`, `team`
   for the 2026 class. The rookie filter depends on these. Hit
   `POST /api/sleeper` (admin-gated; there's a button on the MLF admin page).
2. **Create the draft** at `/admin/draft` → status=setup.
3. **Setup → Slots.** Map all 8 slots to users (real + shadow). Set team
   names. For shadow slots: tick the box, expand the foldout, pick a player
   per round.
4. **Pool → Seed Rookie Pool.** Surface flash will read like
   `Seeded 78 matched rookies · 66 new rows (by draftYear=72 · by yearsExp=18 · with team=51 · no team=27)`.
   The breakdown tells you what signal is doing the work. Add/remove manually
   as needed.
5. **Images → upload ≥24 announcer images** so every pick can fire a Goodell
   box without falling back to the seal.
6. **Sponsors → add the "Presented By" sponsor.**
7. **Open Draft.** Status flips `setup → live`. Pick 1 (or first non-shadow
   pick) goes on-clock. Shadow picks lock immediately and fire reactions
   async.

### Mid-draft commissioner controls

- **Pause / Resume.** Status `live ⇄ paused`. Public page renders a paused
  banner; lockPick is gated.
- **Reset.** Wipes all picks + nulls image rotation, keeps slots/pool/etc.
  Recover from a botched open without nuking setup state.
- **Delete.** Hard cascade. Rare; mostly for dry runs.

### Post-draft

- Status flips to `complete` (manual via admin button).
- v1 has no archive page yet — Phase 4 work.
- Sleeper roster handoff is manual: KB exports/copies picks into Sleeper
  himself.

---

## 11. Feature flag

`DRAFT_2026_ENABLED` env var. When `false` (or missing), the public page
renders the "Draft not yet open — flag" skeleton; admin pages still load. This
lets new admin work ship to prod ahead of public visibility.

Set on Railway via project variables. No code change needed to flip.

---

## 12. Slug decoupling

The page used to do `findUnique({ slug: "mlf-2026" })`, which forced the
commissioner to use that exact slug. Current behavior:

```
findFirst({ status: { in: ["live", "paused"] }, orderBy: { openedAt: "desc" } })
  ?? findFirst({ orderBy: { createdAt: "desc" } })
```

Whichever DraftRoom is most recently live (or, failing that, most recently
created) is "the draft." When 2027 rolls around, just create a new room and
the old one quietly drops out of the public route.

---

## 13. Known limitations + future work

- **No live cockpit (Phase 4).** Admin can't undo/skip/reassign mid-draft from
  a dedicated UI yet. The cockpit was scoped but not built; reset is the
  blunt-instrument workaround.
- **No `/results` archive (Phase 4).** Once a draft is `complete`, the public
  page renders a placeholder.
- **No polling on the public page.** Updates require a refresh. The plan
  specced `useDraftPolling` on a 5s interval, paused on tab blur — not built.
- **Scouting report dossier panel.** The cache + generator exist; the UI
  surface (player profile + big-board dossier) is partially wired.
- **Single shadow manager per draft assumed.** The model supports more, but
  the setup UI is one-at-a-time.
- **CSV export for Sleeper handoff.** Not built; manual transcribe for v1.
- **Notifications.** v1 = in-app banner + browser title flash only. No email,
  SMS, or push. KB texts stragglers.

---

## 14. File map

```
src/app/(portal)/sports/mlf/draft-2026/
  page.tsx                  # public draft room (server component, 1200+ lines)
  layout.tsx
  ClockCountdown.tsx        # only client component on this page
  actions.ts                # lockPick

src/app/(portal)/admin/draft/
  page.tsx                  # list of drafts
  actions.ts                # createDraft, deleteDraft
  [id]/
    page.tsx                # single-draft cockpit
    actions.ts              # openDraft, pauseDraft, resumeDraft, completeDraft, resetDraft
    setup/{page,actions}.ts # slots, shadow managers, shadow picks
    pool/{page,actions}.ts  # rookie pool seed + manual edits
    images/{page,actions}.ts # Goodell-box image pool
    sponsors/{page,actions}.ts # presented-by sponsor cards

src/lib/
  draft.ts          # computeSnakeOrder, ordinalPick, formatCaption,
                    # isOnClockFor, seedRookiePool, findNextPendingPick
  draft-flags.ts    # isDraft2026Enabled
  sleeper-ai.ts     # generateRookieScoutingReport, generateDraftPickReaction

prisma/migrations/
  20260424160000_draft_2026_foundation/migration.sql
  20260424210000_shadow_managers/migration.sql

public/
  mlf_logo.png      # 1024×1024 RGBA shield used in hero + skeletons
```

---

## 15. Decisions log (locked with KB)

| # | Topic | Decision |
|---|-------|----------|
| Q1 | Mode | Async, post-NFL-draft. No live event. |
| Q2 | Auth | All managers have lazyriverco accounts; admin maps slot → user. Shadows excepted (no account). |
| Q3 | Rookie pool | QB/RB/WR/TE only. Filter broadened to `draftYear=season OR yearsExp=0` (originally `yearsExp=0 AND team` — too narrow). |
| Q4 | Pick clock | Soft 24h, no auto-pick. Now visually pinned to next 11am CT. |
| Q5 | Pick commit | Single-click LOCK PICK in v1 (confirm sheet deferred). 2-min admin undo window deferred to live cockpit. |
| Q6 | Commissioner | Full override: open / pause / resume / complete / reset / delete. |
| Q7 | Notifications | In-app banner + browser title flash only. KB texts stragglers. |
| Q8 | AI flavor | Scouting reports + pick reactions. No agent-takes / advisor chat. Spicy announcer voice. |
| Q9 | Visual identity | Clash Display + Satoshi, navy/red/cream MLF shield. |
| Q10 | Sleeper sync | Standalone. KB transcribes results to Sleeper manually. |
| Q11 | Goodell box | Commissioner-uploaded images + auto-caption template. |
| Q12 | Image assignment | Random rotation from a commissioner-uploaded pool, without replacement until exhausted. |
| Q15 | Sponsor rail | Draft-scoped sponsors; UI label is "MLF Draft 2026 · Presented By". |
| Q16 | PICK NOW CTA | Removed. The big LOCK PICK button on each pool row is the only commit affordance. |
| Q17 | Reaction authoring | AI-only. Iterate on the prompt, not manual override. |
| Q18 | Naming | "Mens" never has an apostrophe. MLF = Mens League of Football. |

---

*Last updated: 2026-04-26.*
