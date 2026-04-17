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
    take: 30,
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
    </nav>
  );
}
