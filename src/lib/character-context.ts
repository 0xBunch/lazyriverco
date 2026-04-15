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
import { selectMediaForContext } from "@/lib/media-context";

export type RichContextInput = {
  /** The character generating the response. */
  characterId: string;
  /** User IDs that appear in the recent transcript the agent will see. */
  participantUserIds: readonly string[];
  /**
   * Whether to append the shared media bank section. Required (not
   * optional) so every call site states its intent explicitly — the
   * legacy channel orchestrator passes false to preserve behavior, the
   * new per-conversation orchestrator passes true. Making this required
   * prevents the section from being accidentally injected or skipped.
   */
  includeMedia: boolean;
};

/**
 * Returns a single multi-section string ready to prepend to the agent's
 * system prompt. Returns an empty string when no context exists, so the
 * caller can interpolate without nullchecks.
 */
export async function buildRichContext(
  input: RichContextInput,
): Promise<string> {
  const { characterId, participantUserIds, includeMedia } = input;
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

  // 4. Shared media bank — phase 1 injects text URLs + tags + captions
  // only (no vision). Appended AFTER the stable canon/member/relationship
  // sections so the volatile media list sits at the tail of the prompt,
  // keeping Anthropic's prompt cache prefix hot across uploads. Retrieval
  // + sanitization lives in selectMediaForContext, not inlined here, so
  // future tag/embedding-based strategies are a one-file change.
  if (includeMedia) {
    const media = await selectMediaForContext({ characterId });
    if (media.length > 0) {
      const lines = media.map((m) => {
        const parts: string[] = [];
        if (m.caption) parts.push(m.caption);
        if (m.tags.length > 0) parts.push(`(tags: ${m.tags.join(", ")})`);
        parts.push(m.publicUrl);
        return `- ${parts.join(" ")}`;
      });
      sections.push(["# Shared media bank", ...lines].join("\n"));
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : "";
}
