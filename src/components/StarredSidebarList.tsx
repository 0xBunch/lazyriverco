import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * Starred conversations for the current user, newest-pinned first.
 * Returns null when the user has no pins so the caller can omit the
 * section header entirely — empty groups are sidebar noise.
 *
 * Character pins are provisioned in the schema but not wired yet; when
 * they ship, this component will merge them in above the conversations.
 */
export async function StarredSidebarList() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Filter archived conversations in the `where` clause — not post-fetch.
  // A post-fetch filter combined with `take: N` silently under-fills the
  // section when archived pins occupy the top N by createdAt. Push the
  // archived check into the relation filter so the take cap counts only
  // usable pins.
  const pins = await prisma.pin.findMany({
    where: {
      userId: user.id,
      conversationId: { not: null },
      conversation: { archivedAt: null },
      // Keep the query focused on conversations for now. When character
      // pins land we'll add a second findMany and merge client-side.
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      conversation: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  const items = pins
    .map((p) => p.conversation)
    .filter((c): c is { id: string; title: string | null } => c !== null);

  if (items.length === 0) return null;

  return (
    <nav aria-label="Starred conversations" className="py-1">
      <p className="px-5 pb-1 pt-4 text-[0.65rem] font-semibold uppercase tracking-wide text-bone-400">
        Starred
      </p>
      <ul>
        {items.map((c) => (
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
