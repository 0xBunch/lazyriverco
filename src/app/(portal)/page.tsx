import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ConversationLanding } from "@/components/ConversationLanding";
import type { ConversationCharacterDTO, PromptGroupDTO } from "@/lib/chat";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Middleware should have already redirected unauthenticated visitors
    // to /start, but belt-check just in case.
    redirect("/start");
  }

  const [characterRows, promptGroupRows] = await Promise.all([
    // Fetch the active character roster for the agent picker. Order:
    // admin-curated displayOrder, then displayName as a stable tiebreaker.
    // isDefault drives pre-selection, not sort position — picking which
    // agent appears first in the carousel is now an explicit displayOrder
    // decision the admin makes from /admin/ai/personas.
    prisma.character.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        name: true,
        displayName: true,
        avatarUrl: true,
        isDefault: true,
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
        icon: true,
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, label: true, icon: true, prompt: true },
        },
      },
    }),
  ]);

  // The landing component only needs the id of the default to pre-
  // select it — not the flag on every row. Pick the columns explicitly
  // rather than destructure-and-spread so the DTO contract is visible
  // at the call site.
  const characters: ConversationCharacterDTO[] = characterRows.map(
    ({ id, name, displayName, avatarUrl }) => ({
      id,
      name,
      displayName,
      avatarUrl,
    }),
  );
  const defaultCharacterId =
    characterRows.find((c) => c.isDefault)?.id ?? characterRows[0]?.id ?? null;
  const promptGroups: PromptGroupDTO[] = promptGroupRows;

  return (
    <ConversationLanding
      user={{ id: user.id, displayName: user.displayName }}
      characters={characters}
      defaultCharacterId={defaultCharacterId}
      promptGroups={promptGroups}
    />
  );
}
