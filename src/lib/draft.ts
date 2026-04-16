// Draft flow DTOs and helpers — shared between API routes and the UI.
// Keeps the Joey-specific character name in one place.

export const DRAFTING_CHARACTER_NAME = "barfdog";
export const CURRENT_SEASON = 2026;

export type PoolPlayerDTO = {
  id: string;
  playerName: string;
  position: string;
  team: string;
  tagline: string | null;
  drafted: boolean;
};

export type RosterEntryDTO = {
  id: string;
  playerName: string;
  position: string;
  acquiredVia: string;
  season: number;
  weekAcquired: number | null;
  /** The most recent chat message from joey-barfdog, surfaced as commentary. */
  commentary: string | null;
  commentaryAt: string | null;
  createdAtOrder: number;
};

export type PoolResponse = {
  season: number;
  players: PoolPlayerDTO[];
};

export type RosterResponse = {
  season: number;
  character: { id: string; name: string; displayName: string };
  roster: RosterEntryDTO[];
};

export type PickResponse =
  | {
      ok: true;
      pick: {
        player: PoolPlayerDTO;
        round: number;
        commentary: string;
      };
    }
  | { ok: false; error: string };

export type AddPlayerRequest = {
  playerName: string;
  position: string;
  team: string;
  tagline?: string | null;
};
