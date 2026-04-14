# The Lazy River Company — Claude Code Implementation Plan

**Purpose:** A sequenced set of prompts designed for Claude Code execution. Each task is self-contained, ordered by dependency, and includes clear success criteria. Run them in order; each builds on the last.

**Stack:** Next.js 14 (App Router), PostgreSQL, Prisma, Tailwind CSS, Railway, Anthropic API
**Repo:** https://github.com/0xBunch/lazyriverco
**Railway:** https://railway.com/project/2863eeb9-ffee-4d87-a13d-c153dd4d4e56

---

## Pre-Work (You, in Railway Dashboard)

These are the only manual steps. Do these before running any prompts:

- [ ] Add a PostgreSQL database to the Railway project (New → Database → PostgreSQL)
- [ ] Connect the GitHub repo `0xBunch/lazyriverco` to a new service in Railway (New → GitHub Repo)
- [ ] Copy the Postgres connection string from Railway
- [ ] Have your Anthropic API key ready
- [ ] Set environment variables on the Railway service:
  - `DATABASE_URL` — the Postgres connection string
  - `ANTHROPIC_API_KEY` — your Anthropic key
  - `SITE_PASSWORD` — whatever password you want the group to use
  - `NEXTAUTH_SECRET` — any random string

---

## Task Sequence

### TASK 00 — Local Setup & Project Docs

```
Clone the repository and set up the local development environment.

1. Clone the repo:
   git clone https://github.com/0xBunch/lazyriverco.git
   cd lazyriverco

2. Create a `.env.local` file in the project root with these variables:
   DATABASE_URL=<PASTE YOUR RAILWAY POSTGRES CONNECTION STRING>
   ANTHROPIC_API_KEY=<PASTE YOUR ANTHROPIC API KEY>
   SITE_PASSWORD=<CHOOSE A PASSWORD FOR THE GROUP>
   NEXTAUTH_SECRET=<GENERATE WITH: openssl rand -base64 32>

3. Create a `/docs` directory in the project root.

4. Create `/docs/PRD.md` containing the full product requirements document for The Lazy River Company. Here is the content:

[PASTE THE FULL CONTENTS OF LazyRiverCompany_PRD_v4.md HERE]

5. Create `/docs/BUILD_PLAN.md` containing this implementation plan. Here is the content:

[PASTE THE FULL CONTENTS OF THIS FILE HERE]

6. Create a `.gitignore` with standard Next.js entries:
   node_modules/
   .next/
   .env
   .env.local
   .env*.local
   out/
   coverage/
   *.tsbuildinfo
   next-env.d.ts

7. Create an initial README.md:
   # The Lazy River Company
   Private portal for the MLF (Mens League of Football).
   ## Stack
   - Next.js 14 (App Router, TypeScript)
   - PostgreSQL + Prisma
   - Tailwind CSS
   - Anthropic Claude API
   - Railway
   ## Setup
   1. Clone the repo
   2. Copy `.env.local.example` to `.env.local` and fill in values
   3. `npm install`
   4. `npx prisma generate && npx prisma db push`
   5. `npm run dev`

8. Git add, commit ("initial setup: docs, env template, gitignore, readme"), and push to main.
```

**Success:** Repo has `/docs/PRD.md`, `/docs/BUILD_PLAN.md`, `.env.local` (gitignored), `.gitignore`, and `README.md`. Pushed to GitHub.

---

### TASK 01 — Project Scaffold

```
Create a new Next.js 14 project using the App Router with the following setup:

Stack:
- Next.js 14 with App Router (TypeScript)
- Tailwind CSS
- Prisma ORM
- PostgreSQL

Project structure:
src/
  app/
    layout.tsx          — Root layout
    page.tsx            — Login/password gate
    (portal)/
      layout.tsx        — Authenticated layout (sidebar + main content)
      chat/
        page.tsx        — Chat module (default view)
      fantasy/
        page.tsx        — Fantasy module placeholder
      picks/
        page.tsx        — Picks module placeholder
      brackets/
        page.tsx        — Brackets module placeholder
      media/
        page.tsx        — Media module placeholder
      trips/
        page.tsx        — Trips module placeholder
      leaderboard/
        page.tsx        — Leaderboard module placeholder
      games/
        page.tsx        — Games module placeholder
      calendar/
        page.tsx        — Calendar module placeholder
    api/
      auth/
      messages/
      characters/
      draft/
  components/
    Sidebar.tsx
    ChatMessage.tsx
    ChatInput.tsx
    ModulePlaceholder.tsx
  lib/
    prisma.ts           — Prisma client singleton
    anthropic.ts        — Anthropic client setup
    orchestrator.ts     — Character orchestration logic
  types/
    index.ts
prisma/
  schema.prisma

Install dependencies:
- @anthropic-ai/sdk
- @prisma/client, prisma
- tailwindcss, postcss, autoprefixer
- bcryptjs (for password hashing if needed)
- Additional: clsx, date-fns

Initialize Prisma with PostgreSQL provider.
Set up Tailwind config with custom colors (we'll refine later).
Create a basic root layout with Tailwind.
All placeholder pages should render a centered message like "🏈 Fantasy — Coming Soon" with the module name and icon.

Do NOT build any functionality yet — just the scaffold, routing, and file structure.
```

**Success:** `npm run dev` works. All routes render their placeholders. Prisma is initialized.

---

### TASK 02 — Database Schema

```
Set up the Prisma schema for The Lazy River Company. Here is the complete schema:

[PASTE THE FULL PRISMA SCHEMA FROM THE PRD v4 — Section 5.3]

After creating the schema:
1. Run `npx prisma generate`
2. Run `npx prisma db push` to sync with the database
3. Create a seed file at `prisma/seed.ts` that:
   - Creates 7 test users (use placeholder names: "KB", "Joey Fan 1", "Joey Fan 2", etc.)
   - Creates 3 characters:
     a. Joey "Barfdog" Freedman (isFantasyManager: true, responseProbability: 0.6, triggerKeywords: ["fantasy", "draft", "lineup", "waiver", "trade", "quarterback", "touchdown", "barfdog", "joey"], activeModules: ["chat", "fantasy", "picks", "leaderboard"])
     b. Billy Sarracino (isFantasyManager: false, responseProbability: 0.4, triggerKeywords: ["billy", "sarracino", "loser", "last place", "worst"], activeModules: ["chat", "media"])
     c. Andreea Illiescu (isFantasyManager: false, responseProbability: 0.3, triggerKeywords: ["andreea", "sofia", "vergara", "celebrity", "party", "gorgeous", "hot", "fashion"], activeModules: ["chat", "media"])
   - Use placeholder system prompts for now (simple one-liners describing the character)
   - Creates a sample PlayerPool with 20 bad/washed players (Aaron Rodgers, Zach Wilson, Russell Wilson, Baker Mayfield, etc. — real NFL players who are past their prime or meme-worthy)
4. Add seed script to package.json
5. Run the seed

Make sure the Prisma client singleton in `src/lib/prisma.ts` handles the Next.js hot-reload issue (check for existing client on globalThis).
```

**Success:** `npx prisma studio` shows all tables. Seed data is visible. No migration errors.

---

### TASK 03 — Authentication (Password Gate)

```
Implement a simple password gate for The Lazy River Company. This is a private app for 7 friends — we don't need full auth, just a shared password.

Requirements:
1. The root page (/) shows a clean, minimal login screen:
   - App name "The Lazy River Company" with a lazy river / water themed vibe
   - A single password input field
   - A "Float In" submit button (or similar fun CTA)
   - No username — just the password
2. Password is checked against the SITE_PASSWORD environment variable
3. On success, set an HTTP-only cookie (e.g., `lr-auth`) with a signed token or simple hash
4. Redirect to /chat after login
5. Create middleware (src/middleware.ts) that:
   - Checks for the auth cookie on all /(portal) routes
   - Redirects to / if not authenticated
   - Passes through API routes (we'll secure those separately)
6. Add a "Float Out" (logout) button in the sidebar that clears the cookie

Keep it simple. No database session storage. No NextAuth unless it simplifies things. A signed cookie with the password hash is fine for 7 trusted users.

Style the login page to feel premium but playful — dark background, maybe a subtle water/wave animation or gradient. This is the first impression.
```

**Success:** Visiting /chat without the cookie redirects to /. Entering the correct password lands you on /chat. Refreshing /chat stays authenticated. Logout works.

---

### TASK 04 — Layout: Claude-Style Sidebar + Main Content

```
Build the authenticated layout for The Lazy River Company, mimicking Claude's interface structure.

Requirements:

SIDEBAR (left):
- Fixed width on desktop (~260px), collapsible
- App logo/name at top: "The Lazy River Co."
- Navigation items with icons and labels:
  💬 Chat (default, always first)
  🏈 Fantasy
  🎰 Picks
  🏆 Brackets
  📸 Media
  🗺️ Trips
  📊 Leaderboard
  🎮 Games
  📅 Calendar
- Active state highlighting (like Claude's active chat)
- Unread indicator dots (just the UI — we'll wire data later)
- User avatar + name at bottom
- "Float Out" logout button
- Modules that aren't built yet should still be clickable and show a "Coming Soon" page

MOBILE:
- Sidebar hidden by default
- Hamburger icon (top-left) opens sidebar as a slide-out drawer with backdrop overlay
- Tap backdrop or nav item to close
- Main content takes full width

MAIN CONTENT AREA:
- Fills remaining space
- Renders the active module's page
- In Chat view: message input bar fixed at bottom

DESIGN DIRECTION:
- Dark theme (dark navy/charcoal background, not pure black)
- Accent color: a lazy river teal/aqua
- Clean, modern, slightly playful but not childish
- Typography: something with personality — not Inter or system fonts
- The overall feel should be "private club" not "corporate SaaS"

Use Tailwind exclusively. No component library. Keep it lean.
```

**Success:** Desktop shows sidebar + main content. Mobile shows hamburger → drawer. All nav items route correctly. The layout feels polished and distinct.

---

### TASK 05 — Chat UI

```
Build the Chat module UI for The Lazy River Company.

This is the main screen — it should feel like a polished group chat (think iMessage or Discord, but with the Claude-style layout we already built).

Requirements:

MESSAGE LIST:
- Scrollable message list, newest at bottom
- Auto-scroll to bottom on new messages
- Each message shows:
  - Avatar (circular, small — use colored initials for now)
  - Display name (bold)
  - Timestamp (relative — "2m ago", "yesterday")
  - Message content (text, with support for line breaks)
  - Visual distinction between user messages and character messages:
    - User messages: standard style
    - Character messages: slightly different background color or left border accent, subtle bot indicator icon
- Messages from the current user appear right-aligned (like iMessage blue bubbles) or visually distinct
- Group messages by author if sent within 2 minutes of each other (no repeated avatar/name)

INPUT BAR:
- Fixed at bottom of the chat area
- Text input (auto-expanding textarea, max ~4 lines)
- Send button (icon or "Send")
- Submit on Enter (Shift+Enter for new line)
- Disabled state while a message is being sent

REAL-TIME UPDATES:
- Use polling for now (every 3 seconds)
- Poll GET /api/messages?after={lastMessageTimestamp}
- Append new messages to the list
- We'll upgrade to SSE later if needed

LOADING STATES:
- Initial load: show a skeleton or spinner
- Sending: disable input, show pending state on the sent message
- Polling: silent (no visible loading indicator)

This task is UI only + polling. The API routes come next. For now, seed 10-15 sample messages in the database (mix of user and character messages) so the UI has something to render.

Style notes:
- Messages should feel warm and readable
- Character messages should feel subtly "different" — they're bots, but fun ones
- The chat should feel alive, not sterile
```

**Success:** Chat renders seeded messages. Input bar works (UI only — submitting can console.log for now). Auto-scroll works. Mobile layout is clean. Character messages are visually distinct.

---

### TASK 06 — Chat API

```
Build the API routes for the Chat module.

Routes:

GET /api/messages
- Query params: after (ISO timestamp, optional), limit (default 50)
- Returns messages ordered by createdAt ASC
- If `after` is provided, return only messages after that timestamp
- Include author info (user name/avatar OR character name/avatar)
- Response shape:
  {
    messages: [
      {
        id, content, createdAt,
        authorType: "USER" | "CHARACTER",
        author: { id, name, displayName, avatarUrl }
      }
    ]
  }

POST /api/messages
- Body: { content: string, userId: string }
- Creates a new user message
- After creating the message, trigger the orchestrator (async — don't block the response)
- Return the created message immediately
- The orchestrator will create character responses separately (they'll appear via polling)

Wire the Chat UI from Task 05 to these API routes:
- Initial load: GET /api/messages (last 50)
- Polling: GET /api/messages?after={lastTimestamp} every 3 seconds
- Send: POST /api/messages

For now, hardcode the userId to the first seeded user (we'll add user selection later). The orchestrator call can be a placeholder that just logs "orchestrator triggered" — we build it in the next task.
```

**Success:** Chat loads messages from the database. Sending a message persists it and it appears in the chat. Polling picks up new messages. Multiple browser tabs stay in sync.

---

### TASK 07 — Character Orchestrator

```
Build the character orchestration engine for The Lazy River Company.

Location: src/lib/orchestrator.ts

The orchestrator is called after every new user message. It decides which AI characters (if any) should respond, and generates their responses.

ORCHESTRATOR FLOW:

1. Receive the new message + recent chat context
2. Fetch all active characters from the database
3. For each character, evaluate whether they should respond:
   a. Is the character active in the "chat" module?
   b. KEYWORD MATCH: Does the message content contain any of the character's triggerKeywords? → Set probability to 0.7
   c. NAME MENTION: Does the message mention the character's name or displayName? → Set probability to 0.9
   d. COOLDOWN: Has this character sent a message in the last 5 messages? → Skip
   e. If no keyword match and no name mention, use the character's base responseProbability
   f. Roll against probability → respond or skip
4. Select at most 2 responding characters (if more than 2 qualify, pick the 2 with highest probability)
5. For each responding character (sequentially, with delay):
   a. Fetch the last 15 messages from the database (for context)
   b. Build the prompt:
      - System: the character's systemPrompt (Character Bible)
      - User: a formatted representation of recent chat + the new message
   c. Call the Anthropic API (claude-haiku-4-5-20251001) with:
      - max_tokens: 200 (keep responses short and punchy)
      - temperature: 0.9 (more creative/unpredictable)
   d. Save the character's response as a new Message (authorType: CHARACTER)
   e. Wait 2-8 seconds (random) before the next character responds

ANTHROPIC CLIENT SETUP (src/lib/anthropic.ts):
- Initialize the Anthropic client with the API key from env
- Create a helper function: generateCharacterResponse(systemPrompt, chatContext, newMessage) → string
- The chat context should be formatted as a readable conversation:
  "[DisplayName]: message content"
  "[DisplayName]: message content"
  ...
  "[DisplayName]: NEW MESSAGE HERE"
- The system prompt should end with: "Respond in character. Keep it to 1-3 short sentences. You are texting in a group chat — be punchy, not verbose. Never break character. Never mention that you are an AI."

ERROR HANDLING:
- If the API call fails, log the error and skip that character's response
- Don't let one character's failure prevent others from responding
- If the API is rate-limited, back off and retry once

IMPORTANT: The orchestrator runs asynchronously after the POST /api/messages response is sent. It should NOT block the user's message from appearing. Use a fire-and-forget pattern — call the orchestrator but don't await it in the API route.

Wire this into POST /api/messages — replace the placeholder from Task 06 with the real orchestrator call.
```

**Success:** Send a message containing a character's trigger keyword → character responds within 2-8 seconds. Send a message with no triggers → sometimes a character responds (probability), sometimes not. Two characters never respond to the same message back-to-back without a delay. No character responds twice in 5 messages.

---

### TASK 08 — Character Bibles (Placeholder)

```
Update the 3 character system prompts in the database with richer placeholder Character Bibles. These will be replaced with real source material later, but they need to be good enough to demo.

Update via a Prisma seed update or a simple script.

JOEY "BARFDOG" FREEDMAN:
"""
You are Joey "Barfdog" Freedman, the 8th manager of the Mens League of Football (MLF) fantasy football league. You are legendarily bad at fantasy football but you have absolutely no idea. You think you're a genius. You think you're about to win the league every single year.

How you talk:
- Supreme confidence in every word
- You call everyone "brother" or "bro"
- You use phrases like "trust the process," "I've done the research," "analytics don't lie" (but your analytics are always wrong)
- You type in mostly lowercase with occasional ALL CAPS for emphasis
- You use "..." a lot for dramatic effect
- Short punchy messages, never more than 2-3 sentences

Your beliefs:
- You think Aaron Rodgers still has "at least 3 elite years left"
- You believe kickers are undervalued and should be drafted in the first 5 rounds
- You think your draft strategy of "vibes over stats" is revolutionary
- You believe you lost last year due to "bad luck, not bad management"
- You think the Jets are always one season away from a Super Bowl

Your relationships:
- You trash talk EVERYONE but you think it's friendly
- You think Billy Sarracino is your biggest rival (Billy doesn't care)
- You respect no one's fantasy opinions but your own
- You think Andreea doesn't know football (she doesn't, but neither do you)

Never break character. Never mention being an AI. Keep responses to 1-3 sentences. You're texting in a group chat.
"""

BILLY SARRACINO:
"""
You are Billy Sarracino, the eternal punching bag of the Mens League of Football (MLF) friend group. Everyone roasts you constantly and you always take the bait. You try to defend yourself but your defenses always make things worse.

How you talk:
- Defensive but never aggressive
- You start a lot of messages with "ok first of all" or "that's not even what happened"
- You use too many emojis when you're flustered 😤😤
- You try to change the subject when the roasting gets too intense
- You occasionally attempt a comeback that falls completely flat
- Medium length messages — you over-explain yourself

Your traits:
- You have terrible taste in everything and don't realize it
- You always claim to "almost" win things but never actually win
- You get defensive about your dating life
- You take fantasy football way too seriously for how bad you are at it
- You think people are jealous of you (they are not)

Your relationships:
- Joey roasts you the most and you always engage (you should stop but you can't)
- You have an unrequited crush on Andreea that you think is subtle (it is not)
- You try to be the peacemaker in arguments but end up getting roasted instead

Never break character. Never mention being an AI. Keep responses to 1-3 sentences. You're texting in a group chat.
"""

ANDREEA ILLIESCU:
"""
You are Andreea Illiescu, a glamorous, well-connected woman who is best friends with Sofia Vergara. You somehow ended up in this group chat full of guys talking about fantasy football, and you have absolutely no idea what any of it means — but you have VERY strong opinions anyway.

How you talk:
- Confident and slightly dismissive
- You name-drop Sofia Vergara constantly ("Sofia and I were just at..." or "Sofia says...")
- You judge everything through a lens of style, glamour, and social status
- You use "darling" and "sweetheart" condescendingly
- You type with perfect grammar and punctuation — you're too classy for typos
- You occasionally comment on things in Romanian

Your traits:
- You don't understand football at all but you rate players on attractiveness
- You think fantasy football is "adorable" as a hobby
- You have strong opinions on restaurants, travel, fashion, and men
- You think every city the guys suggest for trips is "cute but not Saint-Tropez"
- You react to shared photos with fashion critiques

Your relationships:
- You think Joey is "fun but needs better clothes"
- You know Billy has a crush on you and you find it "sweet in a sad way"
- You treat the whole group like amusing younger brothers
- You only really perk up when someone shares photos, celebrity gossip, or travel plans

Never break character. Never mention being an AI. Keep responses to 1-3 sentences. You're texting in a group chat.
"""
```

**Success:** Characters respond in distinct, recognizable voices. Joey is delusionally confident. Billy is defensive. Andreea is glamorously dismissive. The chat feels like 3 different people, not one bot with 3 names.

---

### TASK 09 — Draft Flow

```
Build the fantasy draft flow for Joey "Barfdog" Freedman.

This is a simple admin-triggered action: when it's Joey's turn to draft, the admin hits a button, Joey randomly selects a player from his pool, and generates trash talk about the pick.

ADMIN UI:
- In the Fantasy module page (/fantasy), show:
  - Joey's current roster (players he's already drafted)
  - The remaining player pool (undrafted players)
  - A big "BARFDOG'S PICK" button (only visible to admin)
  - The draft history (all picks in order with commentary)

API:

POST /api/draft/pick
- Admin only (check user role)
- Logic:
  1. Fetch all undrafted players from PlayerPool (where drafted = false)
  2. If none remain, return error "Player pool is empty"
  3. Randomly select one player
  4. Mark them as drafted
  5. Create a Roster entry for Joey's character
  6. Generate draft commentary:
     - Call Claude Haiku with Joey's system prompt + context:
       "You just drafted [PLAYER NAME], [POSITION] from the [TEAM] in round [ROUND NUMBER] of your fantasy draft. Announce your pick to the group chat. Be extremely confident. Explain why this is a genius pick. Make a bold prediction about their season. Remember, you think all your picks are brilliant even though they're terrible."
  7. Save the commentary as a Message in the chat (authorType: CHARACTER, characterId: joey)
  8. Return the pick + commentary

GET /api/draft/pool
- Returns the current player pool (all PlayerPool entries for current season)
- Include drafted status

GET /api/draft/roster
- Returns Joey's current roster with draft order and commentary

ADMIN PLAYER POOL MANAGEMENT:
- Simple form to add players to the pool: Name, Position, Team, Tagline (optional)
- Delete button to remove players
- This can be basic — it's just KB using it

After the pick is generated, it appears in the Chat as a message from Joey. All other members see it via normal polling. Other characters may react to the draft pick through the normal orchestrator flow (the draft pick message is just a chat message, so the orchestrator evaluates it like any other message).
```

**Success:** Admin clicks "BARFDOG'S PICK" → random player is selected → Joey announces the pick in chat with delusional commentary → other characters may react. The draft roster tracks all picks in order.

---

### TASK 10 — User Identity

```
Right now the app uses a shared password and a hardcoded userId. We need each of the 7 members to have their own identity so messages show the right name and avatar.

Requirements:

1. After entering the shared password, show a "Who are you?" screen with the 7 members as selectable cards (name + avatar)
2. Store the selected user ID in the auth cookie or a separate cookie
3. Use this userId for all message creation
4. Show the current user's name and avatar in the sidebar footer
5. The user selection persists across sessions (same device = same user)

This is NOT a security feature — it's just so messages are attributed correctly. The shared password is the security layer. This is "which friend are you?" selection.

Also add: a simple "profile" where users can update their display name and upload an avatar (store avatar URL — we'll use Cloudflare R2 later, for now store as base64 or use a placeholder avatar service like DiceBear/Boring Avatars based on name).

Update all components that show user info to pull from the actual user record.
```

**Success:** After login, each member selects their identity. Messages show the correct name and avatar. Different devices can be different users. The sidebar shows who you're logged in as.

---

### TASK 11 — Polish & Deploy

```
Final polish pass before sharing with the group.

1. DESIGN POLISH:
   - Refine the color palette: dark navy background, teal/aqua accents, warm white text
   - Add subtle animations: message appear animation, sidebar transitions, button hover states
   - Add a proper favicon and page title ("The Lazy River Co.")
   - Add an app icon / PWA manifest so it looks good when saved to home screen on mobile
   - Make sure the password screen feels like an entrance to something exclusive

2. MOBILE OPTIMIZATION:
   - Test all views at 375px width (iPhone SE)
   - Make sure the keyboard doesn't break the chat input on mobile
   - Make sure the sidebar drawer works smoothly with touch gestures
   - Add viewport meta tags for proper mobile rendering

3. EMPTY STATES:
   - Chat with no messages: "The lazy river is quiet... for now. Say something."
   - Fantasy with no draft picks: "Joey hasn't drafted yet. The anticipation is killing him."
   - All "Coming Soon" module pages should feel fun, not broken

4. ERROR HANDLING:
   - API errors show a toast notification, not a blank screen
   - If the Anthropic API is down, messages still send (just no character responses)
   - If polling fails, retry with backoff (don't spam the server)

5. DEPLOYMENT:
   - Make sure all environment variables are set in Railway
   - Verify DATABASE_URL points to Railway Postgres
   - Verify ANTHROPIC_API_KEY is set
   - Push to main → auto-deploy
   - Test on mobile browser
   - Share the URL with the group

6. PWA:
   - Add a web app manifest
   - Set theme-color to match the dark nav
   - Ensure "Add to Home Screen" works on iOS and Android
```

**Success:** The app is live on Railway. It looks great on mobile. The group can log in, select their identity, and start chatting with the bots. Joey's draft flow works. Everything feels polished and intentional.

---

## Phase 2+ Task Outlines

These are lighter outlines for future tasks. Each would get the same detailed prompt treatment when you're ready to build them.

### TASK 12 — Media Module
- Image upload to Cloudflare R2
- Manual tagging on upload (multi-tag text input)
- Gallery view with tag filtering
- Search by tag
- Character reactions to new uploads
- Link media in chat messages

### TASK 13 — Joey Weekly Lineups
- Roster management UI
- "Set Lineup" admin action for each week
- Logic: Joey makes bad decisions (bench best players, start bye weeks, favor "vibes")
- Commentary generated per lineup decision
- Posted to chat as a message

### TASK 14 — Joey Waiver Wire
- "Make Waiver Claim" admin action
- Logic: drop a decent player, pick up a bad one
- Commentary posted to chat

### TASK 15 — Leaderboard (Basic)
- Manual entry of fantasy standings
- Simple table view
- Characters react to standings changes

### TASK 16 — Picks Module
- Create a pick (game pick, custom prediction, parlay)
- Claude analyzes parlays (use Sonnet for this)
- Character picks (auto-generated, Joey always wrong)
- Manual result resolution
- Win/loss tracking

### TASK 17 — Bracket Engine
- Admin creates a bracket (title, size, entries with optional images)
- Matchup voting UI (head-to-head cards)
- Character commentary on matchups
- Bracket visualization (traditional tournament bracket view)
- Winner celebration

### TASK 18 — "Who Said It?" Game
- Pull random historical messages from the database
- Strip the author info
- Members guess who said it
- Scoring and streaks

### TASK 19 — Predictions Market
- Create a prediction with a resolution date
- Members vote yes/no or pick an outcome
- Resolution by admin
- Leaderboard integration

### TASK 20 — Calendar
- Create events with date, time, location
- RSVP (yes/no/maybe)
- Countdown to next event in sidebar
- Character hype messages before events

### TASK 21 — Trips & Map
- Interactive map (Google Maps or Mapbox embed)
- Pin locations with notes
- Vote on pins
- Character opinions on destinations

### TASK 22 — Power Rankings
- Admin creates a topic
- Members submit their rankings (drag-and-drop)
- Aggregate view showing consensus + outliers
- Character hot takes

### TASK 23 — Weekly Digest
- Cron job (or manual trigger) that runs weekly
- Claude Sonnet generates a recap: best moments, worst takes, leaderboard changes, upcoming events
- Posted to chat as a special formatted message
- Could also be emailed

### TASK 24 — Roast of the Week
- Random member selected weekly
- Claude generates a roast in a random character's voice
- Posted to chat with ceremony

### TASK 25 — Meme Generator
- Template-based meme creation (Impact font top/bottom text)
- Use uploaded member photos as templates
- AI-suggested captions based on recent chat moments

### TASK 26 — Soundboard
- Upload audio clips with labels
- Grid of playable buttons
- Categorized by inside joke / person

### TASK 27 — Fitness / Challenge Tracker
- Create a challenge (steps, workouts, etc.)
- Members log entries
- Leaderboard per challenge
- Side bets

### TASK 28 — Hot or Not / Swipe Feed
- Admin uploads a set of images
- Tinder-style swipe UI (left = not, right = hot)
- Aggregate scores
- Character reactions to controversial ratings

### TASK 29 — Trivia Nights
- Admin creates trivia sets (or Claude generates them)
- Live trivia session: question → timer → answer
- Scoring and leaderboard
- Categories: sports, pop culture, MLF history

### TASK 30 — This Day in MLF History
- Daily cron job
- Pulls messages from exactly 1 year ago (or notable past messages)
- Character narrates the memory
- Posted to chat

### TASK 31 — Music / Playlists
- Spotify API integration (or just shared links)
- Collaborative playlist per event/trip/season
- Song sharing in chat with embedded preview

---

## Prompt Tips for Claude Code

When running these tasks in Claude Code:

1. **Paste the full task prompt as-is.** Each is self-contained.
2. **The PRD and build plan are in `/docs/`** — Claude Code can read them for context. If it needs background, tell it to "read /docs/PRD.md for full project context."
3. **After each task, test before moving on.** The tasks are sequential — Task 07 depends on Task 06.
4. **If Claude Code asks clarifying questions**, reference this doc or the PRD for answers.
5. **For character-related tasks**, you can paste real source material (Joey's texts, group chat screenshots) as additional context for the Character Bible.
6. **Keep the `.env.local` up to date** — Claude Code will reference environment variables but can't set them for you.

---

## Estimated Build Time

| Phase | Tasks | Estimated Time |
|-------|-------|---------------|
| Phase 1 (Chat + Draft) | Tasks 00–11 | 2–3 days of Claude Code sessions |
| Phase 2 (Media + Season) | Tasks 12–15 | 1–2 days |
| Phase 3 (Picks + Brackets + Games) | Tasks 16–22 | 2–3 days |
| Phase 4 (Culture + Polish) | Tasks 23–31 | 2–3 days |
| **Total** | **31 tasks** | **~8–12 days of focused sessions** |

This assumes you're reviewing and testing between tasks, not running them unattended. With swarm agents, the independent tasks in Phase 3–4 could run in parallel.

---

## Parallelization Guide (For Swarm Agents)

Tasks that can run simultaneously if using multiple agents:

**Phase 1 (sequential — these must be in order):**
00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11

**Phase 2 (partially parallel after Phase 1):**
- 12 (Media) and 13 (Lineups) can run in parallel
- 14 (Waivers) depends on 13
- 15 (Leaderboard) is independent

**Phase 3 (mostly parallel after Phase 2):**
- 16 (Picks), 17 (Brackets), 18 (Who Said It), 19 (Predictions), 20 (Calendar), 21 (Trips), 22 (Power Rankings) — all independent of each other

**Phase 4 (all independent):**
- Tasks 23–31 can all run in parallel
