# Changelog

All notable changes to The Lazy River Company portal.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.2] — 2026-04-23

First formally tagged release. Rolls up all work since the project's initial commit on 2026-04-14 — there were no prior git tags. Version jumps from the scaffold default (0.1.0) to 0.4.2 to reflect what has shipped to production over that window.

### Chat & AI
- AI characters — Joey, Billy, Andreea, plus Moises as the default host — each with a distinct system prompt, per-agent model selection from an allowlist, and admin-editable display order
- Per-user conversations with pin and archive, modeled on Claude.ai's sidebar
- Claude Sonnet 4.6 as the default chat model, configurable per character
- Server-side `web_search` tool (Anthropic-managed) for live sports and news chatter
- Client-managed `library_search` tool so agents can cite group library items mid-reply, with hard caps on tool iterations and total calls per turn
- Image-generation toggle via Replicate SDXL with an NSFW community fine-tune option
- Copy and share-image actions on agent replies
- Category chips on the landing hero expand into full-width prompt-suggestion panels

### Library (renamed from Gallery)
- `/gallery` renamed to `/library` across routes, UI, and code
- One-click ingest from anywhere: PWA share target, bookmarklet, and a dedicated `/app` install page
- Bookmarklet save returns an in-popup success card (no redirect to a detail page)
- Tag pages moved from `/library?tag=X` to `/library/t/X`
- Inline add-tag input on item detail pages
- AI auto-tagging via Gemini 2.5 Flash against a controlled vocabulary
- Library-search injection eval (`pnpm eval:injection`) and an AI-tag backfill script

### MLF / Sports
- New `/sports` dashboard with `/sports/mlf` as the league view (replaces the old `/fantasy`)
- Player profile pages at `/sports/mlf/players/[playerId]` with season stats, per-week breakdowns, projections, and per-character agent takes
- "Off the field" partner card on player profiles — manual-trigger lookup with real loading UX, hotlink-safe image proxy, Gemini search grounding, and a fallback to initials on image error
- WAGFINDER pulls Instagram handle and renders as an `@link`
- Claude-generated league season narratives that regenerate on demand
- Nav icon for Sports swapped from trophy to stadium

### Calendar, Gallery & layout
- Calendar month title lifted above Prev / Today / Next nav for clearer orientation
- Dense grouped-list view, bulk actions, and add-date dialog in `/admin/calendar`
- Unified page widths at `max-w-6xl` across chats, calendar, and library
- Landing hero anchored from the top so opening a category panel doesn't shift the input upward
- Simplified page headers on chats, calendar, and library

### Admin
- `LLMUsageEvent` append-only ledger + `ModelPricing` table + `/admin/usage` dashboard for per-user-per-day cost rollups and per-reply drill-downs
- Replicate image-generation tracking in the same usage dashboard
- Agent editor (`/admin/agents`) with per-agent model picker, dialogue mode, trigger keywords, and display order
- Per-(agent, member) relationships editor (`/admin/relationships`)
- Clubhouse canon editor (`/admin/canon`) for shared group lore injected into every prompt
- Prompt groups and prompt suggestions editor (`/admin/prompts`) powering the homepage chip panel
- _Note: as part of the admin condensation series, these three editors moved to `/admin/ai/{personas,opinions,prompts}`. The original paths above 308-redirect to the new locations._

### Navigation & mobile
- Claude.ai-parity mobile and PWA sidebar toggle with safe-area insets for notched devices
- PWA manifest with maskable icons and a Web Share Target at `/library/share`

### Infrastructure
- `railway.toml`'s `preDeployCommand` runs `npx prisma migrate deploy` before every container swap, preventing P2022 (column-does-not-exist) errors
- Legacy redirects for `/media`, `/gallery`, `/admin/{media,gallery}` preserve query strings
- Suspense-wrapped `ConversationView` for Next.js App Router compatibility; `?image=1` query param stripped after mount
- pnpm-lockfile sync for the Replicate dependency
- Replicate community-model version resolution and SSE error surfacing on the chat endpoint

---

[0.4.2]: https://github.com/0xBunch/lazyriverco/releases/tag/v0.4.2
