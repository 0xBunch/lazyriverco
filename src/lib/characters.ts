import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Deterministic ID for the default/"home" character (Moises, the Lazy
 * River companion). Mirrored verbatim from the phase-1 migration INSERT
 * at prisma/migrations/20260415214849_add_conversations_and_defaults_and_media_meta/migration.sql.
 *
 * Changing either value requires changing BOTH and shipping a migration
 * that updates the DB. Same pattern as DEFAULT_CHANNEL_ID in channels.ts:13.
 */
export const DEFAULT_CHARACTER_ID = "f1e2d3c4-b5a6-4978-9012-3456789abcde";

/**
 * Fetch the default Character row. React-cache'd so multiple server
 * components rendering on the same request hit the DB at most once.
 *
 * Throws if zero or more than one row has isDefault=true — the partial
 * unique index `Character_isDefault_key` makes both states impossible at
 * the DB level, but we fail loudly if they somehow occur so a broken
 * seed shows up at the first request, not later.
 */
export const getDefaultCharacter = cache(async () => {
  const rows = await prisma.character.findMany({
    where: { isDefault: true },
    select: {
      id: true,
      name: true,
      displayName: true,
      avatarUrl: true,
      systemPrompt: true,
      active: true,
    },
  });

  if (rows.length === 0) {
    throw new Error(
      "getDefaultCharacter: no default character found. Did the phase-1 migration run on this DB? Expected a row with isDefault=true (Moises).",
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `getDefaultCharacter: expected exactly one default character, found ${rows.length}. The Character_isDefault_key partial unique index should prevent this — investigate.`,
    );
  }
  return rows[0]!;
});
