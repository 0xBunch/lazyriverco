import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_CHARACTER_ID } from "@/lib/characters";
import { ConversationLanding } from "@/components/ConversationLanding";
import type {
  ConversationCharacterDTO,
  ConversationListItem,
} from "@/lib/chat";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Middleware should have already redirected unauthenticated visitors
    // to /sign-in, but belt-check just in case.
    redirect("/sign-in");
  }

  // Fetch the active character roster (for the agent picker) and the
  // most recent conversations (for the "Recent" strip) in parallel. The
  // character query orders by isDefault DESC so Moises always shows
  // first in the dropdown.
  const [characterRows, recentRows] = await Promise.all([
    prisma.character.findMany({
      where: { active: true },
      orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
      select: {
        id: true,
        name: true,
        displayName: true,
        avatarUrl: true,
      },
    }),
    prisma.conversation.findMany({
      where: { ownerId: user.id, archivedAt: null },
      orderBy: { lastMessageAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        createdAt: true,
        lastMessageAt: true,
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
  ]);

  const characters: ConversationCharacterDTO[] = characterRows;
  const recentConversations: ConversationListItem[] = recentRows.map((c) => ({
    id: c.id,
    title: c.title,
    character: c.character,
    createdAt: c.createdAt.toISOString(),
    lastMessageAt: c.lastMessageAt.toISOString(),
  }));

  return (
    <ConversationLanding
      user={{ id: user.id, displayName: user.displayName }}
      characters={characters}
      defaultCharacterId={DEFAULT_CHARACTER_ID}
      recentConversations={recentConversations}
    />
  );
}
