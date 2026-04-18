import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ConversationView } from "@/components/ConversationView";

type PageProps = {
  params: { conversationId: string };
};

/**
 * Per-conversation thread page. Server-renders just the thread header
 * metadata (character, title); messages load client-side via the
 * useChatPolling hook so we share one polling codepath with the legacy
 * #mensleague view. Non-owner hits return 404 (not 403) so we don't
 * leak conversation existence — the ownership check is embedded in the
 * findFirst where clause.
 */
export default async function ConversationPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/start");
  }

  // Fetch conversation metadata and pin state in parallel. The pin query
  // hits a unique-index lookup (@@unique([userId, conversationId])) —
  // constant-time, negligible overhead.
  const [conversation, pin] = await Promise.all([
    prisma.conversation.findFirst({
      where: {
        id: params.conversationId,
        ownerId: user.id,
        archivedAt: null,
      },
      select: {
        id: true,
        title: true,
        character: {
          select: {
            id: true,
            name: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.pin.findUnique({
      where: {
        userId_conversationId: {
          userId: user.id,
          conversationId: params.conversationId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (!conversation) {
    notFound();
  }

  return (
    <ConversationView
      conversationId={conversation.id}
      character={conversation.character}
      title={conversation.title}
      currentUserId={user.id}
      initialPinned={pin !== null}
    />
  );
}
