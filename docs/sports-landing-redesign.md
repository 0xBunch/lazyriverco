# /sports landing redesign — implementation plan

**Status:** Shipped, then partially superseded. The original PR 1 build landed as described below; subsequent changes have re-shaped the right rail and the sponsor surface. See `Subsequent changes` below before treating any module reference here as canonical.

**Subsequent changes:**
- `MlfTopThree` (top-3 strip) replaced by `MlfStandingsRail` — full league standings in the right rail, mobile collapses to top 5.
- `getMlfTopThree` (later renamed `getMlfTopN`) replaced by `getMlfStandings()` in `src/lib/sleeper/standings.ts` — full overview, no slice.
- `SponsorBreakRail` (full-bleed mid-page broadcast break) deleted; replaced by `SponsorRailSquare` rendered inside the right rail, beneath `TonightStrip`.
- BILLBOARD ad shape retired across the runtime + admin. SQUARE is the only ad shape going forward; the `SponsorImageShape` Prisma enum still carries `BILLBOARD` for historical rows but the admin form no longer offers it.
- Right-rail order: `MlfDraftBanner → TonightStrip → SponsorRailSquare → MlfStandingsRail`.

## Context

The `/sports` route at [src/app/(portal)/sports/page.tsx](../src/app/(portal)/sports/page.tsx) is a 107-line placeholder card grid. The redesign replaces it with a daily clubhouse front page that surfaces five live modules: Headlines, WAG of the Day, MLF Standings, YouTube Highlights, and Schedules with where-to-watch. Visual ambition tier matches `/sports/mlf/draft-2026`, not the rest of `/sports/*`.

This plan integrates findings from four critics (design-oracle, rams, product-assassin, architecture-strategist) reviewed 2026-04-27. v3 is grounded in shipped state: the `library-news-and-feeds` infrastructure (PRs #44 A0, #45 A1, #46 B, #47 cron) merged 2026-04-24. Sports headlines build on top of that shipped infrastructure.

Resolutions:

- **Keep all 5 modules**, but cut the duplicate surfaces — no marquee, no full-bleed video strip. One surface per content type.
- **Headlines extends the shipped Feed/NewsItem schema** with `Feed.category` + `NewsItem.sport` columns. Migration shipped as part of sports PR 1.
- **Extract shared cron-core where it pays for itself** — the shipped pattern is a `/api/cron/*` route handler hit by GitHub Actions. Sports PR 2 onward adds new cron routes that share helpers extracted from `src/lib/feed-poller.ts`, not a Railway cron service.
- **WAG commits to editorial scheduling**, not hash-pick rotation. KB queues features a week at a time.

---

## Architecture decisions (locked)

| Decision | Choice | Source |
|---|---|---|
| Module count | 5, but no duplicate surfaces | design-oracle, KB |
| Headlines data path | Extend the **shipped** Feed/NewsItem with `Feed.category` + `NewsItem.sport` columns (migration in sports PR 1) | product-assassin, KB |
| Highlights / Schedules data path | Standalone tables (no shared analog exists) | n/a |
| Cron infrastructure | Add new `/api/cron/*` route handlers (matching shipped pattern at [src/app/api/cron/poll-feeds/route.ts](../src/app/api/cron/poll-feeds/route.ts)). Extract reusable primitives from `src/lib/feed-poller.ts` into `src/lib/cron-core.ts` before sports PR 2 ships its second cron. GitHub Actions hits each route on its own schedule. | architecture-strategist, KB |
| WAG rotation | Editorial schedule (`SportsWagFeature`), no fallback hash-pick | product-assassin |
| Live-state accent | sports-amber `#F2C94C` owns ALL live indicators (live-dot included). claude-pink stays for primary CTAs/focus rings. | design-oracle |
| `SportsLeague` enum | Renamed `SportTag`. Drop `GENERAL`. | architecture-strategist |
| `SportsScheduleGame` admin/sync merge | Heuristic match in PR 4 cron: `(sport, awayTeam, homeTeam, gameTime ±6h)` to upsert manual rows with synced externalId | architecture-strategist |
| Visual hero | The page itself is the hero — WAG owns the editorial fold; MLF + TONIGHT is the live-data spine | design-oracle, KB |
| Fake sponsors / ad slots | New `SportsSponsor` table mirroring shipped [DraftSponsor](../prisma/schema.prisma) (line 1325). Display via the SponsorRail pattern at [src/app/(portal)/sports/mlf/draft-2026/page.tsx](../src/app/\(portal\)/sports/mlf/draft-2026/page.tsx) (lines 600-660). Two surfaces: hero meta presenter line + mid-page broadcast-break rail. | KB |

### Shipped infrastructure (verified 2026-04-27 via `gh pr list` + file reads)

| Surface | File | Status |
|---|---|---|
| `Feed` / `NewsItem` / `FeedPollLog` models | [prisma/schema.prisma](../prisma/schema.prisma) (lines 983-1106) | shipped PR #45 |
| `User.betaFeatures String[]` + `hasBetaFeature` helper | [prisma/schema.prisma](../prisma/schema.prisma) (line 34), [src/lib/feed-types.ts](../src/lib/feed-types.ts) | shipped PR #45 |
| `pollFeed()` + `computeHealth()` libs | [src/lib/feed-poller.ts](../src/lib/feed-poller.ts), [src/lib/feed-health.ts](../src/lib/feed-health.ts) | shipped PR #45 |
| `/admin/feeds` list + actions | [src/app/(portal)/admin/feeds/page.tsx](../src/app/\(portal\)/admin/feeds/page.tsx), [actions.ts](../src/app/\(portal\)/admin/feeds/actions.ts) | shipped PR #46 |
| Cron endpoint (15-min) | [src/app/api/cron/poll-feeds/route.ts](../src/app/api/cron/poll-feeds/route.ts) — GET+POST, gated by `x-cron-secret` header, 5-concurrent feed cap, 10-min budget | shipped PR #46+#47 |
| GitHub Actions workflow | curl to `/api/cron/poll-feeds` every 15 min | shipped PR #47 |
| `DraftSponsor` model (sponsor pattern reference) | [prisma/schema.prisma](../prisma/schema.prisma) (line 1325) — `{name, tagline, imageR2Key, linkUrl, displayOrder, active}` | shipped (draft-2026 work) |

**Not shipped** (originally PRs C/D of feeds plan, deferred indefinitely):

- `/news` page — referenced in schema comments at [prisma/schema.prisma](../prisma/schema.prisma) (line 1041) but no route file exists.
- `/admin/feeds/[id]` per-feed detail page.
- `prune-poll-logs` cron — schema comment at [prisma/schema.prisma](../prisma/schema.prisma) (line 1081) anticipates it; no implementation file. `FeedPollLog` rows accumulate unbounded until this lands.
- No `Sponsor` model exists outside `DraftSponsor` (which is FK-bound to `DraftRoom`).

This plan therefore can NOT assume `/news` exists, and sports PR 1 must NOT depend on prune-poll-logs being in place.

---

## Visual direction — "PRESS BOX"

A nighttime broadcast / clubhouse aesthetic. **Full-bleed and dramatic on desktop; condensed and dense on mobile.** Two scoped extensions to the existing bone+claude design system:

1. **One new accent: `sports-amber #F2C94C`**, defined under `theme.extend.colors.sports.amber`. **Owns 100% of live-state signaling** — pulsing dot, "TONIGHT" pills, "LIVE" status. Pink (`claude-500`) stays for focus rings, primary buttons, link hover. No live-state ever uses pink. No amber ever fills a non-live affordance.
2. **Section labels in call-letter style**: `font-display uppercase tracking-[0.28em] text-[10px] font-semibold text-bone-400`. Marked `aria-hidden="true"` — they're visual ornament. Each section also carries a real `<h2 className="sr-only">` for screen-reader hierarchy.

### Desktop — full-bleed, dramatic

The page **breaks the rest of `/sports/*`'s `max-w-5xl` page frame** on purpose. Two layers:

- **Bleed layer** — `<section className="w-full">` runs edge to edge of the viewport. Used by the hero, the WAG editorial cover, and the thin amber broadcast rules between sections. No `max-w-*`, no horizontal padding constraint.
- **Content layer** — inside the bleed layer, `<div className="mx-auto max-w-7xl px-6 lg:px-10">` constrains text + grid for legibility.

```
DESKTOP (≥md, viewport-wide):
┌══════════════════════════════════════════════════════════════════════┐
║                                                                      ║  ← full-bleed
║   ███████████   ███████   ████████   ████████   █████████   ██████   ║     hero,
║                          "SPORTS"                                    ║     ~clamp(72px, 14vw, 240px)
║                                              · 27 APR 2026  · LIVE● ║     wordmark
║                                                                      ║
└══════════════════════════════════════════════════════════════════════┘
   ─── thin amber rule, full-bleed ───
   ┌──────────────────────────────────────────────────────────────┐
   │                          (max-w-7xl)                          │
   │   WAG OF THE DAY (cols 1–7)   │   MLF · TOP 3 (cols 8–12)    │
   │                               │   TONIGHT  (cols 8–12)       │
   ├──────────────────────────────────────────────────────────────┤
   │   ─ broadcast break · sponsor rail (full-bleed) ────────────  │
   ├──────────────────────────────────────────────────────────────┤
   │   HEADLINES (cols 1–8) │ HIGHLIGHTS (cols 9–12)               │
   │   8 cards, vertical    │ 6 thumbs, vertical                  │
   └──────────────────────────────────────────────────────────────┘
```

Specifics:

- **Hero**: `min-h-[60vh] md:min-h-[70vh]`, full-bleed. Wordmark `font-display font-semibold tracking-tight text-bone-50 text-[clamp(72px,14vw,240px)] leading-[0.85]` — sized to the viewport, not a fixed scale. Date in tabular-nums + LiveDot to the right of the wordmark base.
- **WAG cover**: image is **full-bleed within its grid column** (image fills cols 1–7 to viewport edge on the left side). Name lockup + caption pinned bottom-left of the content layer with a soft gradient overlay (`bg-gradient-to-t from-bone-950/90 via-bone-950/40 to-transparent`).
- **Amber broadcast rule**: a `<hr className="border-0 h-px w-full bg-sports-amber/40" />` between hero and grid, between grid and footer. Full-bleed.
- **No max-width on the page wrapper.** `<main>` is `w-full`. Only inner content layers use `max-w-7xl`.

### Mobile (<md) — condensed, dense

Same content, different posture. Full-bleed treatments stay edge-to-edge (no horizontal padding gutter), but heights drop and lists trim. Cuts excess; never sideways scrolls.

```
MOBILE:
┌────────────────────────────┐
│ "SPORTS" hero              │  ← full-bleed, ~36vh (not 70vh)
│ wordmark scales down       │     wordmark text-[clamp(56px,18vw,96px)]
│ 27 APR · LIVE●             │     date + dot stack below
├────────────────────────────┤
│ WAG OF THE DAY             │  ← full-bleed image, 4:5
│ [image bleeds]             │     name lockup overlaid
│ Athlete + caption          │
├────────────────────────────┤
│ MLF · TOP 3                │  ← tight standings, no W-L, just rank+manager
├────────────────────────────┤
│ TONIGHT                    │  ← 2 cards (not 3)
├────────────────────────────┤
│ ─ broadcast break ────────  │  ← sponsor rail
├────────────────────────────┤
│ HEADLINES                  │  ← 4 cards (not 8) + "+ more" link
├────────────────────────────┤
│ HIGHLIGHTS                 │  ← 3 thumbs (not 6)
│ horizontal snap-scroll     │     scroll-snap-x mandatory
└────────────────────────────┘
```

Specifics:

- **Page horizontal padding**: zero on full-bleed sections (hero, WAG image, amber rule). `px-4` on text-only modules (MLF, TONIGHT, HEADLINES). Highlights becomes a **horizontal scroll-snap row** on mobile (`flex overflow-x-auto snap-x snap-mandatory`) and reverts to a vertical stack on `md:` and up.
- **Content trim** — lists render fewer items via Tailwind `md:` reveals. Render the full 8 headlines server-side; mobile hides items 5–8 with `hidden md:block` on the 5th onward + a "+ more" link. Same pattern for TONIGHT (`hidden md:block` on the 3rd card).
- **Hero density**: the wordmark stays oversized — `clamp(56px, 18vw, 96px)` — but the section height drops to `min-h-[36vh]`. Date + LiveDot stack vertically on mobile (vs. inline on desktop).
- **WAG editorial copy** caption truncates to 1 line on mobile (`line-clamp-1`) vs. 2 lines on desktop.
- **No CSS Grid `order:` property.** DOM order matches mobile visual order matches desktop tab order: hero → wag → mlf → tonight → broadcast-break → headlines → highlights.

### a11y constraints (designed in at plan time per Rams pass)

- LiveDot: `animate-pulse motion-reduce:animate-none`. Always paired with the literal text "LIVE" in any pill — never color-only signaling (WCAG 1.4.1).
- WAG tile: `<article>` with real `<h2>`. Image carries descriptive alt — not `alt=""`.
- Lightbox for highlights: must be `role="dialog" aria-modal="true"`, focus-trapped, ESC closes, returns focus to invoking thumb. Verify the existing portal modal primitive satisfies this; if not, fix in PR 1.
- All interactive cards: `focus-visible:ring-2 focus-visible:ring-claude-500`.
- `tabular-nums` on standings, schedule times, hero date.
- Section call-letter labels `aria-hidden="true"`; sr-only `<h2>` carries the heading.
- All animation ≤200ms, transform/opacity only.
- Marquee auto-scroll surfaces (cut from v1) require WCAG 2.2.2 pause control if ever reintroduced.

---

## PR 0 — Migration: extend shipped Feed/NewsItem with `category` + `sport`

**Lands as part of sports PR 1's migration** (not a separate PR). Adds two columns + an index + two enum types to schema that already has live data in production.

```prisma
// Modify shipped model at prisma/schema.prisma:983
model Feed {
  // ... existing fields preserved exactly
  category FeedCategory @default(GENERAL)
}

enum FeedCategory { GENERAL SPORTS }

// Modify shipped model at prisma/schema.prisma:1046
model NewsItem {
  // ... existing fields preserved exactly
  sport SportTag?                                 // nullable; populated only when feed.category = SPORTS
  @@index([sport, publishedAt(sort: Desc)])
}

enum SportTag { NFL NBA MLB NHL MLS UFC }
```

Migration SQL — **two files**, per data-integrity-guardian review 2026-04-27. The transactional file does fast catalog-only ops; the index goes in a separate non-transactional file so it can use `CREATE INDEX CONCURRENTLY`.

**File 1** — `prisma/migrations/<ts>_sports_landing/migration.sql` (transactional, default Prisma wrapper):

```sql
-- Cap how long DDL blocks writers queued behind us. If a long-running
-- transaction holds AccessShare on these tables, fail fast rather than
-- queueing all subsequent writers behind our DDL waiter.
SET lock_timeout      = '3s';
SET statement_timeout = '30s';

-- IF NOT EXISTS on CREATE TYPE requires PG ≥ 15 (Railway runs 15/16).
-- Idempotency matters: a half-applied migration leaves orphaned types,
-- and a re-run with bare CREATE TYPE fails.
CREATE TYPE IF NOT EXISTS "FeedCategory" AS ENUM ('GENERAL', 'SPORTS');
CREATE TYPE IF NOT EXISTS "SportTag"     AS ENUM ('NFL', 'NBA', 'MLB', 'NHL', 'MLS', 'UFC');

-- Feed.category NOT NULL DEFAULT 'GENERAL'. PG ≥ 11 stores the default in
-- pg_attribute.attmissingval and synthesizes it for pre-existing tuples
-- — no table rewrite. ACCESS EXCLUSIVE held only for catalog updates
-- (milliseconds).
ALTER TABLE "Feed"     ADD COLUMN "category" "FeedCategory" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "NewsItem" ADD COLUMN "sport"    "SportTag";

-- Sports-side new table CHECK (cheap; table is empty at migration time)
ALTER TABLE "SportsScheduleGame" ADD CONSTRAINT "SportsScheduleGame_team_distinct"
  CHECK ("homeTeam" <> "awayTeam");
```

**File 2** — `prisma/migrations/<ts>_sports_landing_index/migration.sql` (non-transactional; required for CONCURRENTLY):

```sql
-- prisma+disable-transactions
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so
-- this migration file disables Prisma's transaction wrapper. Plain
-- CREATE INDEX would take SHARE lock and block all NewsItem writers
-- (the 15-min poll-feeds cron) for the build duration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "NewsItem_sport_publishedAt_idx"
  ON "NewsItem" ("sport", "publishedAt" DESC);
```

**Down-migration (rollback)** — order matters: index → columns → types. Types-before-columns would fail on referenced-type errors.

```sql
DROP INDEX  IF EXISTS "NewsItem_sport_publishedAt_idx";
ALTER TABLE "NewsItem" DROP COLUMN IF EXISTS "sport";
ALTER TABLE "Feed"     DROP COLUMN IF EXISTS "category";
DROP TYPE   IF EXISTS "SportTag";
DROP TYPE   IF EXISTS "FeedCategory";
```

**Migration safety review (data-integrity-guardian, 2026-04-27):**

- ✅ `Feed.category NOT NULL DEFAULT 'GENERAL'` — Postgres ≥ 11 fast-default semantics. No table rewrite. ACCESS EXCLUSIVE for milliseconds.
- ✅ `NewsItem.sport` nullable — pure catalog update. With `lock_timeout = '3s'`, a slow holder of AccessShare won't queue all writers behind our DDL.
- ✅ `CREATE INDEX CONCURRENTLY` (split into File 2) — does NOT block writers. Required for a populated table that the 15-min cron continuously writes to.
- ✅ `CREATE TYPE IF NOT EXISTS` — Railway runs PG ≥ 15. Re-run idempotent.
- ✅ Down-migration drop order: index → columns → types.
- ✅ `pollFeed` insert site verified at [src/lib/feed-poller.ts](../src/lib/feed-poller.ts) line 307 — `prisma.newsItem.createMany({ data: rows, skipDuplicates: true })`. Adding a nullable `sport` column is invisible to this insert; Prisma's generated type makes new optional columns omittable.

**Out of scope for sports PR 1:** updating `/admin/feeds` UI to expose the category + sport dropdowns. That's a one-screen `<select>` add — bundle into sports PR 1 or fast-follow as PR 1.1. Until that ships, sports feeds get `category=SPORTS` set via Prisma Studio or a one-off SQL update.

---

## PR 1 — Page shell + WAG + MLF + Highlights + Schedule (admin) + Headlines (read-only)

### Schema additions ([prisma/schema.prisma](../prisma/schema.prisma))

```prisma
model SportsWag {
  id            String   @id @default(uuid())
  name          String                              // partner's name
  athleteName   String
  sport         SportTag
  team          String?
  imageUrl      String                              // proxied via existing image route
  instagramUrl  String?
  caption       String?  @db.VarChar(280)          // editorial 1-liner
  hidden        Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  features      SportsWagFeature[]

  @@index([hidden])
}

model SportsWagFeature {                            // editorial schedule — required for any rotation
  id          String   @id @default(uuid())
  wagId       String
  wag         SportsWag @relation(fields: [wagId], references: [id], onDelete: Cascade)
  featureDate DateTime @db.Date
  caption     String?  @db.VarChar(280)            // optional override of SportsWag.caption for this feature

  @@unique([featureDate])                          // one WAG per day
  @@index([featureDate])
}

model SportsHighlight {
  id              String   @id @default(uuid())
  youtubeVideoId  String   @unique
  title           String
  channel         String
  thumbUrl        String
  durationSec     Int?
  publishedAt     DateTime
  sport           SportTag
  hidden          Boolean  @default(false)
  sortOrder       Int      @default(0)
  createdAt       DateTime @default(now())

  @@index([hidden, publishedAt(sort: Desc)])
}

model SportsScheduleGame {
  id          String   @id @default(uuid())
  sport       SportTag
  awayTeam    String
  homeTeam    String
  awayLogoUrl String?
  homeLogoUrl String?
  gameTime    DateTime
  network     String?
  watchUrl    String?
  status      ScheduleStatus @default(SCHEDULED)
  externalId  String?                               // populated by PR 4 sync
  hidden      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([sport, externalId])                     // NULLs are distinct in Postgres — admin rows coexist
  @@index([hidden, gameTime])
  @@index([sport, gameTime])
  @@index([sport, awayTeam, homeTeam, gameTime])    // helper for PR 4 heuristic merge
}

model SportsSponsor {
  id           String   @id @default(uuid())
  name         String                                  // brand name displayed in display type
  tagline      String?  @db.VarChar(140)              // italic 1-liner in quotes (matches DraftSponsor)
  href         String?                                 // optional click-through (mocked as # in fake-ad mode)
  active       Boolean  @default(true)
  displayOrder Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([active, displayOrder])
}

enum ScheduleStatus { SCHEDULED LIVE FINAL POSTPONED }
// SportTag enum lives in PR 0 migration and is shared with NewsItem.sport
```

Migration constraint:

```sql
ALTER TABLE "SportsScheduleGame" ADD CONSTRAINT "SportsScheduleGame_team_distinct"
  CHECK ("homeTeam" <> "awayTeam");
```

### WAG-of-the-Day rotation (`src/lib/sports/wag-rotation.ts`)

```ts
// Editorial scheduling only — no fallback hash pick.
export async function getWagOfTheDay(date = startOfUtcDay()): Promise<{ wag: SportsWag; caption: string | null } | null> {
  const feat = await prisma.sportsWagFeature.findUnique({
    where: { featureDate: date },
    include: { wag: true },
  });
  if (!feat || feat.wag.hidden) return null;
  return { wag: feat.wag, caption: feat.caption ?? feat.wag.caption };
}
```

Empty state UX: admin sees "No WAG scheduled for today — open admin queue →". Non-admin sees a quiet "On break today." Schedule a week at a time via `/admin/sports/wags/queue`.

### How WAGs get into `SportsWag` (the population question)

The schema is the easy part. Building a curated roster of 30+ entries by hand is not. Verified the existing partner-photo pipeline at [src/lib/player-partner.ts:175-247](../src/lib/player-partner.ts) — the Gemini + Wikipedia + Google Search grounding pipeline takes `fullName, position, team` strings. The Sleeper coupling is **only** the player-lookup at lines 190-202 that resolves those strings from a Sleeper player ID. Everything below that point is name-based already.

**Population strategy: extract the name-based core, layer Sleeper lookup on top.**

```ts
// New: src/lib/player-partner.ts (extract from runGenerate, lines 209+)
export async function generatePartnerByName(
  fullName: string,
  sport: SportTag,        // for the prompt — "NFL receiver" vs "NBA point guard"
  team?: string | null,
): Promise<PartnerRow | null> {
  // Identical Gemini call to runGenerate, but driven by free-form athlete
  // metadata instead of a Sleeper row. Returns the same PartnerRow shape.
}

// Existing generatePlayerPartner becomes a thin wrapper:
async function runGenerate(playerId: string): Promise<PartnerRow | null> {
  // ...existing cache check...
  const player = await prisma.sleeperPlayer.findUnique({ where: { playerId }, select: {...} });
  if (!player) return null;
  return generatePartnerByName(player.fullName, "NFL", player.team);
}
```

**Admin form wiring** at `/admin/sports/wags`:

1. KB types `athleteName` (and selects `sport` + optional `team`).
2. KB clicks "Find partner" → POST to a new server action `findPartnerByName({ athleteName, sport, team })`.
3. Server action: `assertWithinLimit(user.id, "sports.wag.find", { maxPerMinute: 10, maxPerDay: 60 })` (mirrors the existing rate limit at [src/app/api/sleeper/players/[playerId]/partner/route.ts:78-80](../src/app/api/sleeper/players/\[playerId\]/partner/route.ts)). Then calls `generatePartnerByName(athleteName, sport, team)`.
4. Response auto-fills `name` (partner's name), `imageUrl`, `instagramUrl` on the form. KB confirms or edits, hits Save → `SportsWag` row created.
5. KB schedules the WAG to a specific date via `/admin/sports/wags/queue`.

For NFL athletes already in `SleeperPlayer`, KB can optionally type the athlete name and the form looks them up first — pre-populating `team` and using the cached `PlayerPartnerInfo` if present. Pure ergonomics; not load-bearing.

**Cost check (per CLAUDE.md AI API rule):**

- Model: same as existing partner pipeline (`PARTNER_MODEL` constant in `src/lib/player-partner.ts`). No new model added.
- Per-call cost: identical to today's WAGFINDER call. Already visible in `/admin/usage` under `media.analyze` operation.
- Volume: KB-triggered only (button click). Rate-limited at 10/min, 60/day per user. Realistic volume for building a roster: ~30 calls over a week. Trivial.
- No loops, no cron-triggered AI, no fire-and-forget. Same risk profile as the shipped Apr 21 feature.

**Risks specific to this approach:**

| Risk | Mitigation |
|---|---|
| `generatePartnerByName` extraction regresses the existing `/sports/mlf` partner card | Refactor lands in its own commit on PR 1's branch. Verify by hitting the existing player-profile partner button before/after — same PartnerRow returned for the same input. |
| Gemini results for non-NFL athletes (NBA/MLB stars) are lower quality | The model has solid coverage on top-tier athletes across sports. KB confirms each result before saving — the form is human-in-the-loop, not auto-commit. Bad result = KB edits or discards. |
| Image-proxy host allow-list rejects partner photos from non-Wikipedia sources | Same risk flagged elsewhere. Verified at PR 1 implementation by trying a non-Wikipedia URL through the proxy. Extend allow-list if needed. |

**Alternative considered and rejected:** pure-manual entry (paste image URL + IG handle by hand). Tedious enough that the WAG roster never reaches 30+ entries, and a thin queue means "On break today" is the default state. Rejected per product-assassin's editorial-commit principle: a feature that exists but has nothing to show is worse than no feature.

**Out of scope for PR 1:** bulk seed script. KB curates 5-10 entries via the admin form to validate the pipeline, then a follow-up PR can add a "seed roster from a list of athlete names" admin action if KB wants to front-load.

### Page wiring

`src/app/(portal)/sports/page.tsx` — server component, `force-dynamic`. Single batch of parallel reads:

```ts
const [wag, mlfTopThree, headlines, highlights, schedule, anyLive, sponsors] = await Promise.all([
  getWagOfTheDay(),
  getMlfTopThree(),                                  // src/lib/sleeper/standings.ts
  prisma.newsItem.findMany({                         // depends on PR 0 (FeedCategory.SPORTS)
    where: { hidden: false, feed: { category: "SPORTS", enabled: true } },
    orderBy: { publishedAt: "desc" },
    take: 8,
    include: { feed: { select: { name: true } } },
  }),
  prisma.sportsHighlight.findMany({
    where: { hidden: false },
    orderBy: [{ sortOrder: "desc" }, { publishedAt: "desc" }],
    take: 6,
  }),
  prisma.sportsScheduleGame.findMany({
    where: { hidden: false, gameTime: { gte: new Date() } },
    orderBy: { gameTime: "asc" },
    take: 6,
  }),
  prisma.sportsScheduleGame.count({
    where: { status: "LIVE", hidden: false },
  }),
  prisma.sportsSponsor.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
  }),
]);

// Sponsor rotation — deterministic by date so the same brand shows all day,
// then advances at UTC midnight. Mirrors draft-2026's draft.sponsors[0]
// pattern but adds time-based rotation (draft uses static "first active").
const sponsor = sponsors.length > 0
  ? sponsors[hashStr(startOfUtcDay().toISOString()) % sponsors.length]
  : null;
const sponsorIndex = sponsor ? sponsors.findIndex(s => s.id === sponsor.id) : -1;
```

Headlines query reads from already-shipped `NewsItem`. After PR 0 migration adds `category` + `sport`, this query is the canonical sports-headline path. Initial sports feeds get seeded via Prisma Studio or a one-off SQL update setting `Feed.category = SPORTS` and `Feed.kind = NEWS` until the admin UI exposes the dropdown.

### Components (under `src/app/(portal)/sports/_components/`)

| File | Role | Notes |
|---|---|---|
| `SportsHero.tsx` | Wordmark + tabular-nums date + LiveDot if `anyLive > 0` | Server. **No marquee.** |
| `WagOfTheDay.tsx` | Editorial cover tile (4:5), name lockup, caption | Server. `<article>` + `<h2>`. Empty state: "On break today." |
| `MlfTopThree.tsx` | Compact tabular-nums leaderboard, top 3 + link to `/sports/mlf` | Server. Reuses `getTopN` extracted from existing MLF page. |
| `TonightStrip.tsx` | 3-card stack: away@home, time, network pill, watch link | Server. Network pill in amber when `status === "LIVE"`. |
| `HeadlinesRail.tsx` | Vertical news cards with thumb + source pill | Server. Empty state: "No sports headlines yet." |
| `HighlightsGrid.tsx` | YouTube thumbnail vertical stack; click → modal lightbox | Client only for the modal trigger; cards themselves render server-side. |
| `SectionHeader.tsx` | Call-letter label + sr-only `<h2>` | Shared. |
| `LiveDot.tsx` | `animate-pulse motion-reduce:animate-none` amber dot | Always paired with literal "LIVE" text in parent. |
| `SponsorPresenter.tsx` | Inline "Presented By [Brand]" line in hero meta strip | Server. Renders nothing if `sponsor === null`. |
| `SponsorBreakRail.tsx` | Mid-page broadcast-break: brand name in display type + italic tagline + rotation dots + Visit CTA | Server. Mirrors SponsorRail in `src/app/(portal)/sports/mlf/draft-2026/page.tsx` (lines 600-660). Active dot `bg-sports-amber`, dim dots `bg-bone-700`. Hidden when no active sponsors. |

**Removed from v1 design:** `HeadlineMarquee`, `OnTheTube`. The page has one headlines surface and one highlights surface.

### Existing reusables (verify at PR 1 implementation)

- **Image proxy** from partner-photo feature — verify it accepts arbitrary external image URLs (not host-allowlisted to known partner domains). If allowlisted, extend before PR 1 ships.
- **Sleeper standings query** — extract `getTopN(n)` from inline code in [src/app/(portal)/sports/mlf/page.tsx](../src/app/\(portal\)/sports/mlf/page.tsx) into `src/lib/sleeper/standings.ts`.
- **Existing portal modal primitive** — verify it implements focus trap + ESC close + focus-return for the highlights lightbox.
- **`requireAdmin`** from `src/lib/auth.ts` for `/admin/sports/*`.
- **OG-fetch** — currently inlined in `src/lib/ingest/index.ts`. PR 1 either exposes a sub-helper from that file or copies a minimal version into `src/lib/sports/og-fetch.ts`. Track as fork; consolidate when both paths stabilize.

### Admin curation surface — `/admin/sports/*`

Pattern matches `/admin/feeds`: list + add/edit dialog + soft-delete via `hidden` toggle. **Headlines admin lives at `/admin/feeds`** (set `category: SPORTS, sport: NFL` on the feed) — no separate `/admin/sports/headlines` page.

| Route | Purpose |
|---|---|
| `/admin/sports/wags` | CRUD WAG roster: image upload, name, athlete, sport, team, IG, caption. |
| `/admin/sports/wags/queue` | Calendar picker — assign a WAG to each upcoming day. Drag-reorder or click-to-fill. |
| `/admin/sports/highlights` | Paste YouTube URL → oEmbed populates title/channel/thumb → save. |
| `/admin/sports/schedule` | Add a game (sport, teams, time, network, watch URL) or bulk-paste a week. |
| `/admin/sports/sponsors` | CRUD fake-ad rotation: name, tagline, optional href, active toggle, displayOrder. Mirrors draft-2026's sponsor admin. |

All admin pages: `requireAdmin`. Each has `actions.ts` with Zod validation. **No function-valued props cross the RSC boundary.**

### Files to create / modify (PR 1)

| File | Action |
|---|---|
| `prisma/schema.prisma` | modify — 4 sports models + 1 enum (`ScheduleStatus`) + PR 0 columns/enums on Feed/NewsItem |
| `prisma/migrations/<ts>_sports_landing/migration.sql` | create — transactional file (catalog ops + CHECK) |
| `prisma/migrations/<ts>_sports_landing_index/migration.sql` | create — non-transactional file (CONCURRENTLY index) |
| `tailwind.config.ts` | modify — add `colors.sports.amber` |
| `src/app/(portal)/sports/page.tsx` | rewrite |
| `src/app/(portal)/sports/_components/{SportsHero,WagOfTheDay,MlfTopThree,TonightStrip,HeadlinesRail,HighlightsGrid,SectionHeader,LiveDot,SponsorPresenter,SponsorBreakRail}.tsx` | create — 10 components |
| `src/lib/sports/{wag-rotation,youtube,og-fetch}.ts` | create |
| `src/lib/sleeper/standings.ts` | create — extract `getTopN` |
| `src/lib/player-partner.ts` | modify — extract `generatePartnerByName(fullName, sport, team)` from `runGenerate`; existing `generatePlayerPartner` becomes a thin wrapper |
| `src/app/(portal)/admin/sports/wags/page.tsx` + `_components/*` + `actions.ts` | create — `actions.ts` exposes `findPartnerByName({athleteName, sport, team})` server action |
| `src/app/(portal)/admin/sports/wags/queue/page.tsx` + `_components/*` + `actions.ts` | create |
| `src/app/(portal)/admin/sports/highlights/page.tsx` + `_components/*` + `actions.ts` | create |
| `src/app/(portal)/admin/sports/schedule/page.tsx` + `_components/*` + `actions.ts` | create |
| `src/app/(portal)/admin/sports/sponsors/page.tsx` + `_components/*` + `actions.ts` | create |
| `src/components/AdminSubNav.tsx` | modify — add Sports tab group |

PR 1 footprint: ~25 new files, 4 modified (added `src/lib/player-partner.ts` to extract the name-based core).

### Verification (PR 1)

End-to-end on Railway after merge (Railway is the only test environment per project memory):

1. **Schema apply** — `prisma migrate deploy` runs cleanly. Verify CHECK constraints and indexes in psql.
2. **Image-proxy host check** — before merging, point `<WagOfTheDay>` at a non-partner-photo host. Confirm proxy serves it. If allowlisted, extend the proxy or revert until fixed.
3. **Empty states** — load `/sports` cold (zero curated content). All five modules + sponsor slot render their empty states. No crash, no console errors.
4. **WAG editorial** — admin schedules a WAG for today via `/admin/sports/wags/queue`. Refresh `/sports` → editorial tile populates with correct caption. Schedule a WAG for tomorrow → today's still shows correctly. Hide a scheduled WAG → tile collapses to "On break today."
5. **Headlines** — admin sets `category=SPORTS, sport=NFL` on an ESPN feed at `/admin/feeds` (or via Prisma Studio). Wait for poll. Confirm headlines appear in `<HeadlinesRail>`.
6. **Highlights** — paste a YouTube URL in `/admin/sports/highlights` → oEmbed populates → save → appears in `<HighlightsGrid>`. Click thumb → lightbox opens, ESC closes, focus returns to thumb.
7. **Schedule + LiveDot** — add a game scheduled now (status=LIVE) → hero LiveDot pulses amber + "LIVE" text appears in TONIGHT card. Add a future game → no live state.
8. **MLF strip** — top 3 matches `/sports/mlf` standings. Link routes correctly.
9. **Sponsor rotation** — add 3 sponsors via `/admin/sports/sponsors`. Page shows one of them in the hero "Presented By" line and the broadcast-break rail (same brand). Rotation dots show 1-of-3 active. Verify next-day rotation lands on a different sponsor (test by mocking date in dev).
10. **Mobile** — single-column stack except the HIGHLIGHTS snap-scroll row. Hero and WAG image stay full-bleed (zero horizontal padding). Lists trimmed: 4 headlines, 2 TONIGHT cards, 3 highlights at-rest. Touch targets ≥44px. No accidental horizontal page scroll outside the highlights row.
11. **Desktop** — hero ≥70vh, full-bleed, wordmark scales to viewport. WAG image bleeds to viewport edge on the left. Amber rules run edge to edge. Content grid stays inside `max-w-7xl`.
12. **a11y sweep** — `prefers-reduced-motion: reduce` disables LiveDot pulse. Tab order = DOM order = visual order. Screen reader hits each section's `<h2>` in document flow. Highlight lightbox traps focus, ESC works, focus returns.
13. **Performance** — `Promise.all` keeps server time <150ms with seeded data. Lighthouse a11y ≥95.

---

## PR 1.5 — Extract `cron-core` from shipped feed-poller

Triggered before sports PR 2 ships its first sports-specific cron. The shipped pattern at [src/app/api/cron/poll-feeds/route.ts](../src/app/api/cron/poll-feeds/route.ts) is:

- A `/api/cron/<name>/route.ts` handler — GET+POST, both gated by `x-cron-secret` header
- A GitHub Actions workflow that curls the route on a schedule
- Per-feed advisory lock + p-limit(5) concurrency + 10-min budget, all inside the route handler

Sports PRs 2/3/4 will each add a new cron route. To prevent forking the route-handler boilerplate three times, PR 1.5 extracts:

- `src/lib/cron-core.ts`:
  - `withCronAuth(req, handler)` — gates on `x-cron-secret`, returns 401/500 on misconfig.
  - `withCronBudget(ms, items, perItemFn)` — wraps the budget + p-limit pattern from `poll-feeds/route.ts`. Returns structured outcome.
  - `tryAdvisoryLock(name, fn)` — Postgres `pg_try_advisory_lock(hashtext(name))` wrapper.
- Refactor `src/app/api/cron/poll-feeds/route.ts` to use the new helpers (no behavior change). Verify in worktree before merge.
- Sports PRs 2/3/4 add `/api/cron/poll-sports-{headlines,youtube,schedule}/route.ts` — each ~30 lines, registers itself in the same GitHub Actions workflow file (one job per cron, separate cron expressions).

Out of scope: a unified `defineJob` registry. Three sibling routes is fine; the second copy is what justifies the helpers, not a registry abstraction.

`prune-poll-logs` (still unshipped) lands as a separate cron route under the same pattern when `FeedPollLog` table size starts to bite.

---

## PR 2 — Sports headlines automation

**Almost free, given the shipped poller.** With `Feed.category` and `NewsItem.sport` columns landed in PR 1, sports headlines flow through the existing shipped `pollFeed()` at [src/lib/feed-poller.ts](../src/lib/feed-poller.ts). PR 2 is:

- Seed initial sports feeds via `/admin/feeds` (ESPN top stories per sport, The Athletic NFL, ProFootballTalk, Bleacher Report) with `category=SPORTS, sport=<league>, kind=NEWS`.
- Add a `<FeedCategoryFilter>` + `<FeedSportSelect>` to the shipped `/admin/feeds` list view + add-feed dialog.
- Update Zod validation in `actions.ts:createFeed` / `updateFeed` to accept the new fields.
- Optional: per-sport filter chips on the sports `<HeadlinesRail>` (defer to PR 2.1).

PR 2 size: ~150 LOC across 2-3 files. No new cron, no new lib, no new schema (PR 1 covered the schema). The win from extending shipped rather than forking.

---

## PR 3 — YouTube highlights polling

- New `SportsYoutubeChannel` table: `id, channelId, channelName, sport, enabled`.
- New `/api/cron/poll-sports-youtube/route.ts` — daily cron via the cron-core helpers from PR 1.5. GitHub Actions hits it once a day.
- Uses YouTube Data API v3, free quota (10k units/day; channel listing ~5 units per channel × ~10 channels = ~50 units/day, trivial).
- Inserts `SportsHighlight` rows on new videos. Dedup on `youtubeVideoId @unique`.
- `/admin/sports/youtube` to manage channel list.
- **Cost check:** YouTube Data API v3 is free under quota. No AI calls. $0/mo.

---

## PR 4 — Schedules sync (TheSportsDB → ESPN fallback)

- New `/api/cron/poll-sports-schedule/route.ts` — every 4 hours during in-season.
- New `/api/cron/poll-sports-schedule-live/route.ts` — every 5 min, short-circuits when no games scheduled within ±2h.
- Primary: TheSportsDB `eventsnext.php?id=<league>` (free, no key for v1).
- Fallback for broadcaster info: ESPN `site.api.espn.com/apis/site/v2/sports/<sport>/<league>/scoreboard`.
- **Heuristic merge for admin-entered rows**: before INSERT of a new synced game, look for an existing row matching `(sport, awayTeam, homeTeam, gameTime BETWEEN gameTime - 6h AND gameTime + 6h)` with `externalId IS NULL`. If found, UPDATE that row's `externalId` and broadcaster fields instead of INSERT. Helper index `[sport, awayTeam, homeTeam, gameTime]` already added in PR 1.
- Live status updater flips `SCHEDULED → LIVE → FINAL` on the 5-min job during game windows.
- **Cost check:** TheSportsDB free tier + ESPN hidden API are free. No AI calls. $0/mo.

---

## Risks & open questions

| Risk | Mitigation |
|---|---|
| Migration on populated `Feed`/`NewsItem` tables | `Feed.category NOT NULL DEFAULT 'GENERAL'` + `NewsItem.sport` nullable. Postgres ≥ 11 adds these in-place without table rewrite. Existing rows take the GENERAL default, which is correct for already-shipped library feeds. |
| Cron route handler refactor (PR 1.5) regresses shipped poller | Refactor is structural only, no behavior change. Verify in a worktree by running `pollFeed` against a known-good RSS before/after and diffing PollOutcome JSON. Land PR 1.5 as its own PR — never bundle with new feature work. |
| Image proxy host allow-list rejects arbitrary WAG image hosts | Verified at PR 1 step 2. If allow-listed, extend the proxy before merge. |
| Editorial WAG queue runs dry → "On break today" everywhere | Honest empty state per product-assassin's editorial-commit principle. KB queues a week at a time; calendar UI surfaces gaps. |
| Existing portal modal primitive doesn't trap focus | Verified at PR 1 step 6. If non-conformant, fix the primitive itself (benefits other features). |
| sports-amber leaks beyond `/sports/*` | Token scoped under `colors.sports.amber`; grep audit at PR review. |
| `SportsScheduleGame` admin/sync duplicates | PR 4 heuristic merge addresses; helper index in PR 1 makes it fast. |
| YouTube oEmbed returns CORS or 404 | oEmbed is server-side; admin sees clear error and can paste manual title/channel as fallback. |

**Open questions surfaced in critic review:**

1. WAG name display semantics — first-name only, full name, or "[Athlete]'s wife/GF"? Affects `SportsWag.name` content. **Default (PR 1):** partner's full name; athlete's full name in lockup.
2. Live-dot trigger scope — any `LIVE` game across all sports, or only MLF-roster-relevant? **Default (PR 1):** any LIVE game in `SportsScheduleGame`. Refinable later.
3. Headlines per-sport filtering on `/sports` page — needed in PR 1 or defer to PR 2? **Default (PR 1):** no filter; show 8 most recent across all sports.

---

## Critical files (PR 1 quick-reference)

- [src/app/(portal)/sports/page.tsx](../src/app/\(portal\)/sports/page.tsx) — full rewrite
- `src/app/(portal)/sports/_components/*` — 10 new components
- [prisma/schema.prisma](../prisma/schema.prisma) — 4 sports models + 1 sports enum + PR 0 columns/enums on Feed/NewsItem
- [tailwind.config.ts](../tailwind.config.ts) — sports.amber extension
- `src/lib/sports/{wag-rotation,youtube,og-fetch}.ts` — new helpers
- `src/lib/sleeper/standings.ts` — extracted from MLF page
- `src/app/(portal)/admin/sports/{wags,wags/queue,highlights,schedule,sponsors}/` — 5 admin surfaces
- [src/components/AdminSubNav.tsx](../src/components/AdminSubNav.tsx) — add Sports tab group

---

## Process notes

- v1 reviewed 2026-04-27 by design-oracle, rams (skill), product-assassin, architecture-strategist. Verdicts: design-oracle "iterate", product-assassin "revise", architecture-strategist "iterate", rams 2-critical / 4-serious. v2 integrated KB's resolutions to all four.
- v2 → v3 correction 2026-04-27: `library-news-and-feeds` had already shipped (PRs #44/45/46/47 merged 2026-04-24). Verified via `gh pr list` + reading shipped Feed/NewsItem schema, feed-poller, and cron route. Plan rewritten to ground in shipped state, not in-flight assumption.
- Critics deferred until PR 1 implementation: kieran-typescript-reviewer (after code lands), code-simplicity-reviewer (final pass), data-integrity-guardian + data-migration-expert (run on actual migration SQL — especially the `Feed.category` + `NewsItem.sport` adds on populated tables).
- Visual reference: see [mockups/sports-desktop.html](../mockups/sports-desktop.html) and [mockups/sports-mobile.html](../mockups/sports-mobile.html) (landed PR #71).
