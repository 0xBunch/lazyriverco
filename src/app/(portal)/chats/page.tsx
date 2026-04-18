import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { searchConversationIdsForOwner } from "@/lib/chat-search";
import { groupByDateBucket } from "@/lib/date-buckets";
import { ChatsRow, type ChatsRowItem } from "@/components/ChatsRow";
import { ChatsViewTabs, type ChatsView } from "@/components/ChatsViewTabs";
import { ChatsFilterChips } from "@/components/ChatsFilterChips";

// /chats — full-page management surface for the user's AI conversations.
// Mirrors claude.ai/recents in shape: search the title, group by recency,
// star/archive/rename via the row menu, filter by Character.
//
// All state in URL search params so the page is SSR-only and shareable:
//   ?q=keyword       FTS over Conversation.title (owner-scoped)
//   ?character=id    filter to one Character
//   ?view=active|starred|archived   default = active
//   ?page=N          1-based pagination, PAGE_SIZE per page
//
// Sidebar Recents (rendered by (portal)/layout.tsx) is left untouched
// — it stays the quick-access strip; this page is the management view.

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  character?: string;
  view?: string;
  page?: string;
};

const PAGE_SIZE = 50;
const VIEWS = new Set<ChatsView>(["active", "starred", "archived"]);

function normalizeView(raw: string | undefined): ChatsView {
  return VIEWS.has(raw as ChatsView) ? (raw as ChatsView) : "active";
}

function normalizePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const q = (params.q ?? "").trim();
  const characterId = (params.character ?? "").trim() || null;
  const view = normalizeView(params.view);
  const page = normalizePage(params.page);

  // FTS resolves to a list of allowed ids (or null if no query). Empty
  // array = "no titles match" — Prisma's `id: { in: [] }` correctly
  // returns zero rows, so we don't need an early return.
  const searchedIds = q
    ? await searchConversationIdsForOwner(user.id, q, 200)
    : null;

  const where: Prisma.ConversationWhereInput = { ownerId: user.id };

  if (view === "active" || view === "starred") {
    where.archivedAt = null;
  } else {
    where.archivedAt = { not: null };
  }
  if (view === "starred") {
    where.pins = { some: { userId: user.id } };
  }
  if (characterId) {
    where.characterId = characterId;
  }
  if (searchedIds !== null) {
    where.id = { in: searchedIds };
  }

  const [total, rows, characters] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        character: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true },
        },
        pins: {
          where: { userId: user.id },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.character.findMany({
      where: { active: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);

  const items: ChatsRowItem[] = rows.map((c) => ({
    id: c.id,
    title: c.title,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.messages[0]?.content?.trim().slice(0, 120) ?? null,
    isStarred: c.pins.length > 0,
    isArchived: c.archivedAt !== null,
    character: c.character,
  }));

  const grouped = groupByDateBucket(items, (it) => it.lastMessageAt);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const passthroughParams = params as Record<string, string | undefined>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pt-20 md:pt-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
          Chats
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50 text-balance">
          {viewTitle(view)}
        </h1>
      </header>

      <form
        action="/chats"
        method="get"
        role="search"
        className="mb-4 flex gap-2"
      >
        <label htmlFor="chats-q" className="sr-only">
          Search chats
        </label>
        <input
          id="chats-q"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search titles…"
          className="flex-1 rounded-md border border-bone-800/60 bg-bone-900/40 px-3 py-2 text-sm text-bone-100 placeholder:text-bone-400 focus:border-claude-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        />
        {/* Preserve other URL params across search submits. */}
        {characterId ? (
          <input type="hidden" name="character" value={characterId} />
        ) : null}
        {view !== "active" ? (
          <input type="hidden" name="view" value={view} />
        ) : null}
        <button
          type="submit"
          className="rounded-md border border-bone-800/60 bg-bone-900/40 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-bone-200 transition-colors hover:text-bone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        >
          Search
        </button>
      </form>

      <div className="mb-6 space-y-3">
        <ChatsFilterChips
          characters={characters}
          activeCharacterId={characterId}
          searchParams={passthroughParams}
        />
        <ChatsViewTabs active={view} searchParams={passthroughParams} />
      </div>

      {items.length === 0 ? (
        <EmptyState q={q} view={view} characterId={characterId} />
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.bucket}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-bone-400">
                {group.bucket}
              </h2>
              <ul className="space-y-0.5">
                {group.items.map((row) => (
                  <ChatsRow key={row.id} row={row} />
                ))}
              </ul>
            </section>
          ))}
          <Pagination
            page={page}
            totalPages={totalPages}
            searchParams={passthroughParams}
          />
        </div>
      )}
    </div>
  );
}

function viewTitle(view: ChatsView): string {
  switch (view) {
    case "active":
      return "All chats";
    case "starred":
      return "Starred";
    case "archived":
      return "Archived";
  }
}

function EmptyState({
  q,
  view,
  characterId,
}: {
  q: string;
  view: ChatsView;
  characterId: string | null;
}) {
  if (q || characterId) {
    return (
      <div className="rounded-md border border-dashed border-bone-800 bg-bone-950/40 px-6 py-12 text-center">
        <p className="text-sm text-bone-300">No chats match your filters.</p>
        <Link
          href="/chats"
          className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-claude-300 hover:text-claude-100"
        >
          Clear filters
        </Link>
      </div>
    );
  }
  if (view === "starred") {
    return (
      <Empty
        title="No starred chats"
        body="Star a conversation from the row's ⋯ menu to pin it here."
      />
    );
  }
  if (view === "archived") {
    return (
      <Empty
        title="Nothing archived"
        body="Archived conversations show up here. Restore them from the row menu."
      />
    );
  }
  return (
    <Empty
      title="No chats yet"
      body="Start a conversation from the sidebar's “+ New chat” button."
    />
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-bone-800 bg-bone-950/40 px-6 py-12 text-center">
      <p className="text-sm font-medium text-bone-100">{title}</p>
      <p className="mt-1 text-xs text-bone-400 text-pretty">{body}</p>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function hrefForPage(p: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/chats?${qs}` : "/chats";
  }

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-6 pt-2 text-xs text-bone-400"
    >
      {prevDisabled ? (
        <span aria-disabled className="opacity-40">
          ‹ Prev
        </span>
      ) : (
        <Link href={hrefForPage(page - 1)} className="hover:text-bone-100">
          ‹ Prev
        </Link>
      )}
      <span className="tabular-nums">
        Page {page} of {totalPages}
      </span>
      {nextDisabled ? (
        <span aria-disabled className="opacity-40">
          Next ›
        </span>
      ) : (
        <Link href={hrefForPage(page + 1)} className="hover:text-bone-100">
          Next ›
        </Link>
      )}
    </nav>
  );
}
