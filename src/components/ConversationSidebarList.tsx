import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type GroupKey = "today" | "yesterday" | "week" | "older";

const GROUP_LABELS: Record<GroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  older: "Older",
};

const GROUP_ORDER: readonly GroupKey[] = [
  "today",
  "yesterday",
  "week",
  "older",
];

function groupFor(date: Date, now: Date): GroupKey {
  const days = (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
  // Naive bucketing — app is single-timezone for a US-based crew, so
  // "today" == last 24h, "yesterday" == 24-48h, "last 7 days" == 2-7d.
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return "week";
  return "older";
}

/**
 * Server component — fetches the current user's recent conversations
 * and renders them grouped by age. Mounted in Sidebar.tsx between the
 * mini-app nav and the user footer. Returns null for signed-out users
 * so the Sidebar layout stays clean.
 */
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
    return (
      <div className="border-t border-bone-800 px-5 py-4">
        <p className="text-[0.7rem] italic text-bone-500">
          No conversations yet.
        </p>
      </div>
    );
  }

  const now = new Date();
  const grouped = new Map<GroupKey, typeof conversations>();
  for (const c of conversations) {
    const key = groupFor(c.lastMessageAt, now);
    const bucket = grouped.get(key) ?? [];
    bucket.push(c);
    grouped.set(key, bucket);
  }

  return (
    <nav
      aria-label="Recent conversations"
      className="flex-1 overflow-y-auto border-t border-bone-800 py-2"
    >
      {GROUP_ORDER.map((key) => {
        const items = grouped.get(key);
        if (!items || items.length === 0) return null;
        return (
          <div key={key} className="mb-3">
            <p className="px-5 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-bone-500">
              {GROUP_LABELS[key]}
            </p>
            <ul className="space-y-px px-2">
              {items.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/chat/${c.id}`}
                    className="block truncate rounded-lg px-3 py-1.5 text-xs text-bone-200 transition-colors hover:bg-bone-800/70 hover:text-bone-50"
                    title={c.title ?? "Untitled chat"}
                  >
                    {c.title ?? "Untitled chat"}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
