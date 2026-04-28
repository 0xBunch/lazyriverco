import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUTHOR_SELECT, toDTO, type ChatMessageDTO } from "@/lib/chat";
import { DEFAULT_CHANNEL_ID } from "@/lib/channels";
import { MLChatRoom } from "@/components/MLChatRoom";
import { MLCHAT_PAGE_SIZE } from "@/lib/mlchat/types";

// /mlchat — shared real-time room for the 7 league members + named
// agents. SSR loads the last MLCHAT_PAGE_SIZE messages so first paint
// is the current state of the room; MLChatRoom takes over from there
// (SSE feed, scroll, composer). The page is dynamic by virtue of
// requireUser() reading cookies — no explicit `force-dynamic` needed.

export default async function MLChatPage() {
  const user = await requireUser();

  const rows = await prisma.message.findMany({
    where: { channelId: DEFAULT_CHANNEL_ID },
    orderBy: { createdAt: "desc" },
    take: MLCHAT_PAGE_SIZE,
    include: {
      user: { select: AUTHOR_SELECT },
      character: { select: AUTHOR_SELECT },
    },
  });

  const initialMessages: ChatMessageDTO[] = rows
    .map((m) => toDTO(m))
    .filter((d): d is NonNullable<ReturnType<typeof toDTO>> => d !== null)
    .reverse();

  return (
    // h-[100dvh] bounds the page to one viewport so the message stream
    // is the only scroll surface. Parent (SidebarShell <main>) is just
    // min-h-screen, which would otherwise let the page grow with content
    // and put the composer at the very bottom of a tall scroll, miles
    // below the message list.
    <div className="flex h-[100dvh] min-h-0 flex-col">
      <MLChatRoom
        currentUserId={user.id}
        initialMessages={initialMessages}
      />
    </div>
  );
}
