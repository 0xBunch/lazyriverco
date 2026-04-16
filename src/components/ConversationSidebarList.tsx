import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type GroupKey = "today" | "yesterday" | "week" | "older";

const GROUP_LABELS: Record<GroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Previous 7 days",
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
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return "week";
  return "older";
}

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
      className="py-1"
    >
      {GROUP_ORDER.map((key) => {
        const items = grouped.get(key);
        if (!items || items.length === 0) return null;
        return (
          <div key={key} className="mb-1">
            <p className="px-4 pb-1 pt-3 text-[0.6rem] font-medium text-bone-500">
              {GROUP_LABELS[key]}
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
          </div>
        );
      })}
    </nav>
  );
}
