import "server-only";

// Build the per-call "rich context" block injected into a character's
// system prompt. Six layers, assembled in a stable order so Anthropic's
// prompt cache keeps the prefix hot:
//
//   1. Core identity (ClubhouseCanon) — always injected
//   2. Core lore (isCore=true Lore entries) — always injected
//   3. Member facts — per participant
//   4. Relationship narratives — agent-specific
//   5. Selected lore — Haiku-picked topic-relevant entries
//   6. Selected media — Haiku-picked topic-relevant assets/links
//   7. Upcoming dates — calendar entries within ±7 days
//
// Sections 1-4 are stable (change rarely). Sections 5-7 vary per
// message and sit at the tail for cache efficiency.

import { prisma } from "@/lib/prisma";
import {
  selectMediaForContext,
  selectMediaByIds,
} from "@/lib/media-context";
import { isAgentMediaViaToolEnabled } from "@/lib/anthropic";
import type { CalendarContextRow } from "@/lib/calendar-context";

const MAX_LORE_CHARS = 4000; // ~1000 tokens budget for selected lore

export type RichContextInput = {
  /** The character generating the response. */
  characterId: string;
  /** User IDs that appear in the recent transcript the agent will see. */
  participantUserIds: readonly string[];
  /**
   * Whether to include media context. Required so every call site
   * states its intent explicitly.
   */
  includeMedia: boolean;
  /**
   * Lore entry IDs selected by the Haiku two-pass call. When present,
   * only these entries (plus isCore entries) are injected. When absent,
   * no topic-selected lore is injected (backward compatible).
   */
  selectedLoreIds?: string[];
  /**
   * Media entry IDs selected by the Haiku two-pass call. When present,
   * these specific entries are fetched instead of the hall-of-fame +
   * recent fallback. When absent AND includeMedia is true, falls back
   * to the existing selectMediaForContext behavior.
   */
  selectedMediaIds?: string[];
  /**
   * Calendar entries within the date window (pre-fetched by the caller
   * via getUpcomingCalendarEntries). When present, injected as
   * "# Upcoming dates". When absent, skipped.
   */
  calendarEntries?: CalendarContextRow[];
};

/**
 * Returns a single multi-section string ready to prepend to the agent's
 * system prompt. Returns an empty string when no context exists, so the
 * caller can interpolate without nullchecks.
 */
export async function buildRichContext(
  input: RichContextInput,
): Promise<string> {
  const {
    characterId,
    participantUserIds,
    includeMedia,
    selectedLoreIds,
    selectedMediaIds,
    calendarEntries,
  } = input;
  const userIds = [...new Set(participantUserIds)];

  // --- Parallel fetch: stable layers ---
  const [canon, coreLore, members, relationships] = await Promise.all([
    prisma.clubhouseCanon.findFirst({
      where: { name: "default" },
      select: { content: true },
    }),
    prisma.lore.findMany({
      where: { isCore: true },
      orderBy: { sortOrder: "asc" },
      select: { topic: true, content: true },
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

  // 1. Core identity (ClubhouseCanon)
  const canonContent = canon?.content?.trim();
  if (canonContent) {
    sections.push(["# Mens League canon", canonContent].join("\n"));
  }

  // 2. Core lore (always injected, no Haiku selection)
  if (coreLore.length > 0) {
    const lines = coreLore.map(
      (l) => `**${l.topic}**: ${l.content.trim()}`,
    );
    sections.push(["# Core knowledge", ...lines].join("\n\n"));
  }

  // 3. Member facts — only for members with at least one populated field.
  const memberLines: string[] = [];
  for (const m of members) {
    const blurb = m.blurb?.trim();
    const fields: string[] = [];
    if (m.city) fields.push(`lives in ${m.city}`);
    if (m.favoriteTeam) fields.push(`roots for the ${m.favoriteTeam}`);
    if (m.role === "ADMIN") fields.push("commissioner");
    if (!blurb && fields.length === 0) continue;
    const header =
      `- ${m.displayName}` +
      (fields.length > 0 ? ` (${fields.join("; ")})` : "");
    if (blurb) {
      memberLines.push(`${header}: ${blurb}`);
    } else {
      memberLines.push(header);
    }
  }
  if (memberLines.length > 0) {
    sections.push(
      [
        "# The crew (the people in this conversation)",
        ...memberLines,
      ].join("\n"),
    );
  }

  // 4. Relationship narratives — agent-specific.
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

  // --- Volatile layers (vary per message, at the tail for cache) ---

  // 5. Selected lore — Haiku-picked topic-relevant entries
  if (selectedLoreIds && selectedLoreIds.length > 0) {
    const selectedLore = await prisma.lore.findMany({
      where: { id: { in: selectedLoreIds } },
      orderBy: { sortOrder: "asc" },
      select: { topic: true, content: true },
    });
    if (selectedLore.length > 0) {
      let charCount = 0;
      const lines: string[] = [];
      for (const l of selectedLore) {
        const entry = `**${l.topic}**: ${l.content.trim()}`;
        if (charCount + entry.length > MAX_LORE_CHARS) break;
        charCount += entry.length;
        lines.push(entry);
      }
      if (lines.length > 0) {
        sections.push(
          ["# Relevant lore (selected for this conversation)", ...lines].join(
            "\n\n",
          ),
        );
      }
    }
  }

  // 6. Media — Haiku-selected if IDs provided, else fallback to
  // hall-of-fame + recent (backward compatible).
  //
  // When AGENT_MEDIA_VIA_TOOL=true, skip this section entirely — Sonnet
  // will reach for the gallery_search tool when the conversation calls
  // for it, and we want one source of truth per turn (no double-
  // surfacing through pre-compute AND tool).
  if (includeMedia && !isAgentMediaViaToolEnabled()) {
    const media =
      selectedMediaIds && selectedMediaIds.length > 0
        ? await selectMediaByIds(selectedMediaIds)
        : await selectMediaForContext({ characterId });
    if (media.length > 0) {
      const lines = media.map((m) => {
        const parts: string[] = [];
        // Prefer uploader-written caption; fall back to scraped
        // originTitle when there's nothing else to describe the item.
        const headline = m.caption ?? m.originTitle;
        if (headline) parts.push(headline);
        if (m.originAuthor) parts.push(`(by ${m.originAuthor})`);
        if (m.tags.length > 0) parts.push(`(tags: ${m.tags.join(", ")})`);
        parts.push(m.publicUrl);
        return `- ${parts.join(" ")}`;
      });
      sections.push(["# Relevant media", ...lines].join("\n"));
    }
  }

  // 7. Calendar — upcoming dates within ±7 days
  if (calendarEntries && calendarEntries.length > 0) {
    const lines = calendarEntries.map((c) => {
      const dateStr = c.date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const timeStr = c.time ? ` at ${c.time}` : "";
      const recurrenceNote =
        c.recurrence === "annual" ? " (every year)" : "";
      const desc = c.description ? ` — ${c.description}` : "";
      return `- ${c.title}: ${dateStr}${timeStr}${recurrenceNote}${desc}`;
    });
    sections.push(["# Upcoming dates", ...lines].join("\n"));
  }

  return sections.length > 0 ? sections.join("\n\n") : "";
}
