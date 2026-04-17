import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_CHARACTER_ID } from "@/lib/characters";
import { ConversationLanding } from "@/components/ConversationLanding";
import type { ConversationCharacterDTO } from "@/lib/chat";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Middleware should have already redirected unauthenticated visitors
    // to /sign-in, but belt-check just in case.
    redirect("/sign-in");
  }

  // Fetch the active character roster for the agent picker. Ordering by
  // isDefault DESC pins Moises to the top.
  const characterRows = await prisma.character.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
    select: {
      id: true,
      name: true,
      displayName: true,
      avatarUrl: true,
    },
  });

  const characters: ConversationCharacterDTO[] = characterRows;

  return (
    <ConversationLanding
      user={{ id: user.id, displayName: user.displayName }}
      characters={characters}
      defaultCharacterId={DEFAULT_CHARACTER_ID}
    />
  );
}
