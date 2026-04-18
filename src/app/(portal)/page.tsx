import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_CHARACTER_ID } from "@/lib/characters";
import { ConversationLanding } from "@/components/ConversationLanding";
import type { ConversationCharacterDTO, PromptGroupDTO } from "@/lib/chat";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Middleware should have already redirected unauthenticated visitors
    // to /sign-in, but belt-check just in case.
    redirect("/sign-in");
  }

  const [characterRows, promptGroupRows] = await Promise.all([
    // Fetch the active character roster for the agent picker. Ordering
    // by isDefault DESC pins Moises to the top.
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
    // Active prompt groups with at least one active item — groups that
    // would render as an empty-menu dropdown are filtered out server-
    // side so the homepage never shows a trigger that opens to nothing.
    prisma.promptGroup.findMany({
      where: {
        isActive: true,
        items: { some: { isActive: true } },
      },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        label: true,
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, label: true, prompt: true },
        },
      },
    }),
  ]);

  const characters: ConversationCharacterDTO[] = characterRows;
  const promptGroups: PromptGroupDTO[] = promptGroupRows;

  return (
    <ConversationLanding
      user={{ id: user.id, displayName: user.displayName }}
      characters={characters}
      defaultCharacterId={DEFAULT_CHARACTER_ID}
      promptGroups={promptGroups}
    />
  );
}
