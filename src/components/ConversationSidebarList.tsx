import { IconDots } from "@tabler/icons-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Flat chronological list — the temporal grouping (Today/Yesterday/etc)
// lived here in a previous iteration but created a two-level hierarchy
// underneath the "Recents" section header. Claude's sidebar is flat under
// Recents; we follow that discipline. Sort order (lastMessageAt desc)
// preserves the implicit chronology.
export async function ConversationSidebarList() {
  const user = await getCurrentUser();
  if (!user) return null;

  const conversations = await prisma.conversation.findMany({
    where: { ownerId: user.id, archivedAt: null },
    orderBy: { lastMessageAt: "desc" },
    // Capped — the "All chats" link below routes to /chats for the
    // full management view (search, archive, etc.). Don't bump this
    // without rethinking that overflow.
    take: 10,
    select: {
      id: true,
      title: true,
      lastMessageAt: true,
      character: { select: { displayName: true } },
    },
  });

  if (conversations.length === 0) {
    return null; // Clean — no empty-state clutter in the sidebar
  }

  return (
    <nav aria-label="Recent conversations" className="py-1">
      <p className="px-5 pb-1 pt-4 text-[0.65rem] font-semibold uppercase tracking-wide text-bone-400">
        Recents
      </p>
      <ul>
        {conversations.map((c) => (
          <li key={c.id}>
            <a
              href={`/chat/${c.id}`}
              className="mx-1 block truncate rounded-md px-3 py-1.5 text-[0.8rem] text-bone-300 transition-colors hover:bg-bone-800/60 hover:text-bone-50"
              title={c.title ?? "Untitled chat"}
            >
              {c.title ?? "Untitled chat"}
            </a>
          </li>
        ))}
      </ul>
      <a
        href="/chats"
        className="mx-1 mt-1 flex items-center gap-2 rounded-md border border-bone-700 px-3 py-1.5 text-[0.75rem] text-bone-400 transition-colors hover:border-bone-500 hover:bg-bone-800/40 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
      >
        <IconDots aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>All chats</span>
      </a>
    </nav>
  );
}
