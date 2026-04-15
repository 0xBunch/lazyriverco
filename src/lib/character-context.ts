// Build the per-call "rich context" block injected into a character's
// system prompt. Three layers, all admin-curated, all degrade gracefully
// when empty:
//
//   1. Clubhouse canon — the broader Mens League lore (one big text doc
//      shared by every agent).
//   2. Member facts — for every user appearing in the recent transcript,
//      a short blurb plus structured fields (city, favorite team).
//   3. Relationship narrative — this agent's specific take on each of
//      those users, free-form text. Only included when set.
//
// The helper takes the SET of user IDs that appear in the recent transcript
// (so we don't dump irrelevant facts on a 7-person clubhouse). Caller is
// responsible for assembling that set; orchestrator extracts it from the
// message slice it already fetches for transcript context.

import { prisma } from "@/lib/prisma";

export type RichContextInput = {
  /** The character generating the response. */
  characterId: string;
  /** User IDs that appear in the recent transcript the agent will see. */
  participantUserIds: readonly string[];
};

/**
 * Returns a single multi-section string ready to prepend to the agent's
 * system prompt. Returns an empty string when no context exists, so the
 * caller can interpolate without nullchecks.
 */
export async function buildRichContext(
  input: RichContextInput,
): Promise<string> {
  const { characterId, participantUserIds } = input;
  const userIds = [...new Set(participantUserIds)];

  const [canon, members, relationships] = await Promise.all([
    prisma.clubhouseCanon.findFirst({
      where: { name: "default" },
      select: { content: true },
    }),
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            displayName: true,
            blurb: true,
            city: true,
            favoriteTeam: true,
            role: true,
          },
        })
      : Promise.resolve([]),
    userIds.length > 0
      ? prisma.agentRelationship.findMany({
          where: {
            characterId,
            targetUserId: { in: userIds },
          },
          select: {
            content: true,
            targetUser: { select: { displayName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const sections: string[] = [];

  // 1. Clubhouse canon
  const canonContent = canon?.content?.trim();
  if (canonContent) {
    sections.push(["# Mens League canon", canonContent].join("\n"));
  }

  // 2. Member facts — only for members with at least one populated field.
  const memberLines: string[] = [];
  for (const m of members) {
    const blurb = m.blurb?.trim();
    const fields: string[] = [];
    if (m.city) fields.push(`lives in ${m.city}`);
    if (m.favoriteTeam) fields.push(`roots for the ${m.favoriteTeam}`);
    if (m.role === "ADMIN") fields.push("commissioner");
    if (!blurb && fields.length === 0) continue;
    const header = `- ${m.displayName}` + (fields.length > 0 ? ` (${fields.join("; ")})` : "");
    if (blurb) {
      memberLines.push(`${header}: ${blurb}`);
    } else {
      memberLines.push(header);
    }
  }
  if (memberLines.length > 0) {
    sections.push(
      ["# The crew (the people in this conversation)", ...memberLines].join("\n"),
    );
  }

  // 3. Relationship narratives — agent-specific.
  const relationshipLines: string[] = [];
  for (const r of relationships) {
    const content = r.content?.trim();
    if (!content) continue;
    relationshipLines.push(`- ${r.targetUser.displayName}: ${content}`);
  }
  if (relationshipLines.length > 0) {
    sections.push(
      [
        "# What you (specifically) think about these people",
        ...relationshipLines,
      ].join("\n"),
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : "";
}
