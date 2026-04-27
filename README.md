# The Lazy River Company

*Corporate extranet of the Lazy River Corporation, a subsidiary of Mens League.*

Private portal for the MLF (Mens League of Football) — a close-knit fantasy football group of friends. Lives at [lazyriver.co](https://lazyriver.co).

---

## What it is

Lazy River is an AI-driven private group app for ~7 members. It wraps a few things into one place:

- **Chat with AI characters** (Joey, Billy, Andreea, Moises) who know the crew, the league, and the lore.
- **MLF dashboard** — standings, rosters, player profiles, and projections pulled from Sleeper.
- **Library** — shared media vault with bookmarklet + share-target ingest and AI auto-tagging.
- **Calendar & Gallery** — trip planning and a photo archive that compounds over years.
- **Admin surface** — agent editor, member blurbs, canon, prompt suggestions, LLM cost analytics.

It's built to feel like a clubhouse, not a SaaS product. Private, opinionated, and built for year three — what matters is what's in the library three seasons from now, not weekly actives in month one.

---

## Features

### Chat & AI characters
- Per-user conversations with pin and archive, modeled on Claude.ai's sidebar
- Four AI personas — Joey, Billy, Andreea, and a default host (Moises) — each with distinct system prompts and per-agent model selection
- Claude Sonnet 4.6 for chat by default; configurable per agent from an allowlist
- Server-side web search (Anthropic-managed `web_search` tool) for current events and sports chatter
- Client-managed `library_search` tool so agents can cite items from the group library mid-reply
- Image generation toggle powered by Replicate SDXL, with an NSFW community fine-tune
- Copy and share-image actions on every agent reply
- Admin-curated prompt suggestions that expand from category chips into full-width panels

### Library
- Shared media vault (renamed from Gallery in this release cycle)
- One-click ingest from anywhere: PWA share target, bookmarklet, and `/app` install page
- In-popup success card after bookmarklet save (no detail-page redirect)
- AI auto-tagging via Gemini 2.5 Flash against a controlled vocabulary
- Inline tag editing on item detail pages
- Tag-scoped pages at `/library/t/[tag]`

### MLF / Sports
- Sleeper-backed league dashboard at `/sports/mlf`
- Per-player profile pages with season stats, projections, and AI-generated agent takes
- WAGFINDER — manual-trigger partner lookup on player profiles with real loading UX, image proxy, and Gemini grounding
- Partner ("Off the field") card pulls Instagram handle and renders as an @link
- Claude-generated league season narratives that regenerate on demand

### Calendar & Gallery
- Month-title header above Prev / Today / Next nav
- Dense grouped-list view, bulk actions, and add-date dialog in `/admin/calendar`
- Per-entry markdown body with attached media and a designated cover image
- Unified page widths (`max-w-6xl`) across chats, calendar, and library

### Admin
- Agent editor, per-agent relationships (what each character thinks of each member), and canon editor for shared group lore
- Member blurbs, cities, favorite teams — all injected into agent context
- LLM cost tracking: every call lands in the `LLMUsageEvent` ledger, priced against a `ModelPricing` table, rolled up at `/admin/usage`
- Replicate image-generation tracking included in the same dashboard
- Prompt groups and prompt suggestions editor for the homepage chip panel

### Navigation & layout
- Claude.ai-parity mobile and PWA sidebar toggle with safe-area insets
- Simplified page headers across chats, calendar, and library
- Landing hero anchored from top so opening a category panel doesn't shift the input

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) on Node ≥20 |
| Language | TypeScript 5.5 |
| UI | React 18, Tailwind CSS 3.4, `@tabler/icons-react`, `motion` |
| Database | PostgreSQL via Prisma 6 |
| Auth | Custom session (HMAC-signed cookie + bcrypt) |
| Chat LLM | Anthropic Claude Sonnet 4.6 (configurable per agent) |
| Vision LLM | Google Gemini 2.5 Flash (library auto-tagging, partner lookups) |
| Image gen | Replicate SDXL (+ community NSFW fine-tune) |
| Media storage | Cloudflare R2 (presigned uploads and downloads) |
| Fantasy data | Sleeper public API (read-only, no key) |
| Hosting | Railway (GitHub auto-deploy on merge to `main`) |

---

## Architecture at a glance

### Data model highlights

The Prisma schema (`prisma/schema.prisma`) defines 36 models. The load-bearing ones:

- **`User`** — group member. Carries `blurb`, `city`, `favoriteTeam` that get injected into agent context. Sessions are invalidated by bumping `sessionEpoch`.
- **`Character`** — AI persona. Stores `systemPrompt`, `model`, `dialogueMode`, `isDefault` (one-row partial unique index), `triggerKeywords`, `activeModules`.
- **`Conversation` + `Message`** — per-user thread bound to a single character. Messages live on `Conversation` OR on the legacy `Channel` (with a CHECK constraint enforcing exactly one).
- **`Channel`** — legacy group chat. v1 has one channel (`#mensleague`), schema is multi-channel-ready.
- **`AgentRelationship`** — narrative text describing "what character X thinks of member Y," edited in `/admin/ai/opinions`.
- **`ClubhouseCanon`** — shared group lore injected into every agent prompt.
- **`Media`** — R2-backed photo or video. Holds `key`, `aiAnalysisNote`, `tags[]`.
- **`CalendarEntry` + `CalendarEntryMedia`** — trip/event with markdown body and ordered media, one designated cover per entry.
- **`SleeperPlayer` + `PlayerSeasonStats` + `PlayerSeasonProjection`** — cached fantasy data, refreshed daily.
- **`PlayerPartnerInfo` + `PlayerAgentTake`** — WAGFINDER payload and per-character one-liner takes on a player.
- **`Pin`** — polymorphic favorite (conversation OR character, CHECK enforced).
- **`LLMUsageEvent` + `ModelPricing`** — append-only cost ledger with resolved USD.

### Integrations

- **Sleeper API** — read-only, public, no key. Cached to Postgres. Powers `/sports/mlf` and the `lookup_sleeper` agent tool.
- **Anthropic Claude** — chat (streaming), web search (server-side tool), WAGFINDER partner lookups (non-streaming).
- **Google Gemini** — library image auto-tagging pipeline and Gemini grounding on partner lookups. Used instead of Claude here because Claude won't identify public figures in images.
- **Replicate** — image generation (SFW default + NSFW community fine-tune).
- **Cloudflare R2** — S3-compatible media storage. Uses presigned PUT (not POST — R2 doesn't support presigned POST).

### Cost tracking

Every LLM call writes an `LLMUsageEvent` with token counts, operation, iteration, cache-read/cache-creation tokens, and a resolved USD cost pinned to a `ModelPricing` row. `/admin/usage` rolls it up per user per day and drills down to per-reply detail. Replicate image generations land in the same ledger.

---

## Getting started

### Prerequisites
- **Node ≥ 20**
- **pnpm** — this project uses pnpm, not npm. `pnpm-lock.yaml` is the authoritative lockfile; Railway builds with `--frozen-lockfile`.
- **PostgreSQL 15+** — a Railway-hosted instance or a local Docker container.

### Setup

```bash
git clone git@github.com:0xBunch/lazyriverco.git
cd lazyriverco
pnpm install
cp .env.local.example .env.local
# fill in .env.local (see table below)
pnpm db:generate
pnpm db:push        # or pnpm db:migrate for versioned migrations
pnpm db:seed:reset  # seeds the 7 members from SEED_CREDENTIALS
pnpm dev            # http://localhost:3000
```

Sign in at `/start` with any seeded member name and the matching password from `SEED_CREDENTIALS`.

### Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next dev server |
| `pnpm build` | Production build (runs `next build`) |
| `pnpm start` | Serve the production build |
| `pnpm lint` | `next lint` — mirrors what Railway runs on build |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:push` | Push schema changes without generating a migration (dev only) |
| `pnpm db:migrate` | Create and apply an interactive migration |
| `pnpm db:seed` | Run `prisma/seed.ts` |
| `pnpm db:seed:reset` | Destructive reset + reseed — clears members and data |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:validate` | Validate `schema.prisma` syntax |
| `pnpm eval:injection` | Run the library-injection eval |
| `pnpm backfill:ai-tags` | One-off AI tag backfill |

---

## Environment variables

| Key | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET` | yes | HMAC signing key for session cookies |
| `ANTHROPIC_API_KEY` | yes | Claude chat, web search, WAGFINDER lookups |
| `GOOGLE_GENAI_API_KEY` | yes | Gemini vision (library auto-tagging) — paid tier recommended, free tier trains on inputs |
| `SEED_CREDENTIALS` | dev only | JSON array `[{name, password}]` matching seeded users |
| `REPLICATE_API_TOKEN` | if image gen | Replicate API key for SDXL generation |
| `R2_ACCOUNT_ID` | yes | Cloudflare account id for R2 |
| `R2_ACCESS_KEY_ID` | yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | yes | R2 secret key |
| `R2_BUCKET_NAME` | yes | R2 bucket for media |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | yes | Public CDN base URL fronting R2 (used in `next.config.mjs` remotePatterns) |
| `SLEEPER_ENABLED` | optional | `true` to enable `/sports/mlf` and `lookup_sleeper` |
| `SLEEPER_LEAGUE_ID` | if Sleeper on | League id from the Sleeper URL |
| `SLEEPER_CACHE_TTL_MS` | optional | Override short cache (default 120_000) |
| `SLEEPER_PLAYERS_TTL_MS` | optional | Override players cache (default 86_400_000) |
| `SLEEPER_PARTNERS_ENABLED` | optional | `true` enables player-partner lookup on first profile view |
| `REPLICATE_DEFAULT_TXT2IMG_MODEL` | optional | Override default SFW model id |
| `REPLICATE_NSFW_TXT2IMG_MODEL` | optional | Override NSFW community model id |

`.env.local.example` in the repo is a starting point; the table above is authoritative.

---

## Database & migrations

PostgreSQL via Prisma 6. Schema lives in `prisma/schema.prisma` (single file, ~900 lines). 29 migrations to date.

**Authoring workflow:**

```bash
# 1. draft the migration locally (does not apply it)
pnpm db:migrate -- --create-only --name <slug>

# 2. review and edit the generated SQL if needed
# 3. commit the new folder under prisma/migrations/
# 4. push to main — Railway applies the migration before the new container serves traffic
```

Railway runs `npx prisma migrate deploy` in `railway.toml`'s `preDeployCommand` so the schema is always up to date before the app handles requests.

**Note:** local dev and production currently share one Postgres instance. `DATABASE_URL` in `.env.local` points at the Railway-hosted DB. Treat every destructive command (`db:push`, `db:seed:reset`, `db:migrate`) as if it will hit prod — because it will.

---

## Deployment

Railway auto-deploys on every push to `main`. No CI pipeline, no staging environment. The flow:

1. Open a PR from a feature branch.
2. Merge to `main`.
3. Railway detects the push, installs with `pnpm install --frozen-lockfile`, runs `next build`, runs `npx prisma migrate deploy`, and swaps the container.
4. The new version is live at `lazyriver.co` 60–90 seconds later.

**Pre-push checklist:**
- Run `pnpm lint` and `pnpm build` locally — `next build` runs an ESLint pass that `tsc --noEmit` doesn't catch.
- If the PR adds a migration, make sure `prisma/migrations/` contains it — Railway reads from there, not from `schema.prisma`.
- Verify after merge: `gh run watch` or the Railway dashboard. A `git push` isn't a deploy.

---

## Auth

Custom session auth — no NextAuth, no Clerk.

- Sign-in page: `/start`
- Login endpoint: `/api/auth/login` — validates against `User.passwordHash` with bcrypt
- Session: HMAC-signed cookie containing `userId` + `sessionEpoch`, verified against the DB on every request in `src/lib/auth.ts`
- Logout: bump `User.sessionEpoch` to invalidate all outstanding cookies for that user
- Middleware (`middleware.ts`) runs in the Edge runtime and only checks cookie presence; full verification happens in Node at the route handler level

---

## PWA

Installable as a standalone app on iOS, Android, and desktop Chrome. The manifest lives at `src/app/manifest.ts` and declares:

- `start_url: /chat`
- `theme_color: #141311` (matches the site chrome)
- Maskable icons for edge-to-edge rendering inside the OS container
- A **Web Share Target** at `/library/share` — installed users get "Lazy River" in their iOS/Android share sheets and can push any URL straight into the library

---

## Project structure

```
src/
  app/
    (portal)/              # all authenticated routes
      chat/                # default chat + per-conversation view
      chats/               # legacy group-channel archive
      library/             # media vault + tag pages + share handler
      sports/              # MLF dashboard + player profiles
      calendar/            # trip & event planner
      gallery/             # photo grid view
      admin/               # agents, canon, members, usage, prompts, ...
      bookmarklet/         # install page for the "Add to Library" bookmarklet
      app/                 # PWA install page
    api/                   # auth, conversations, media, share-image, webhooks
    manifest.ts            # PWA manifest
    layout.tsx             # root layout (fonts, theme)
  components/              # ~40 React components (SidebarShell, ChatFeed, LibraryTile, ...)
  lib/                     # anthropic, ai-tagging, sleeper, r2, auth, usage, ...
prisma/
  schema.prisma            # ~900 lines, 36 models
  migrations/              # 29 timestamped folders, each with migration.sql
  seed.ts                  # seeds 7 members + 4 characters + default channel + prompts
docs/
  LazyRiver_ClaudeCode_BuildPlan.md  # early build plan (stale, kept for reference)
public/                    # icons, static assets
railway.toml               # preDeployCommand only
CHANGELOG.md               # release notes
```

---

## Release & versioning

Semver. Tags live on GitHub Releases. `CHANGELOG.md` at the repo root tracks what shipped in each tag. The release flow:

1. Merge PR to `main`.
2. Pull `main` locally.
3. `git tag -a vX.Y.Z -m "…"` and `git push origin vX.Y.Z`.
4. `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <(…)` pulling the entry from `CHANGELOG.md`.

Current version: **v0.4.2**. See `CHANGELOG.md` for release history.

---

## Conventions

- **pnpm only.** `pnpm-lock.yaml` is authoritative. Never run `npm install`.
- **PR-first.** Push directly to `main` only when explicitly asked.
- **One accent color per view.** No purple gradients, no stock AI aesthetics.
- **Features accrue value.** Metrics are long-tail (year three), not 30-day kill gates.
- **Agents on demand.** AI characters speak when spoken to. No auto-invocation.

---

## License

Private. All rights reserved. Not open for redistribution.
