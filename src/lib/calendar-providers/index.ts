import "server-only";
import type { CalendarProviderType } from "@prisma/client";
import { fetchNager } from "./nager";
import { fetchUsnoMoon } from "./usno-moon";
import { fetchUsnoSeason } from "./usno-season";
import { fetchEspnNfl } from "./espn-nfl";
import { fetchIcalUrl } from "./ical";
import type { CalendarFeedRow, CalendarProviderHandler, SyncedEvent } from "./types";

// Dispatcher: given a CALENDAR-kind Feed row, route to the right
// handler by providerType. Single source of truth for "which provider
// runs for which Feed" — adding a new built-in provider means: add an
// enum value (migration), add a handler module, add a HANDLERS entry.
//
// Throws if providerType is null. The DB-level CHECK constraint
// (Feed_calendar_provider_check) prevents kind=CALENDAR + null
// providerType from existing in production, so this throw is defense
// in depth — would only fire if the constraint is dropped or the
// caller passes a non-CALENDAR feed.

const HANDLERS: Record<CalendarProviderType, CalendarProviderHandler> = {
  NAGER: fetchNager,
  USNO_MOON: fetchUsnoMoon,
  USNO_SEASON: fetchUsnoSeason,
  ESPN_NFL: fetchEspnNfl,
  ICAL_URL: fetchIcalUrl,
};

export async function pollCalendarFeed(
  feed: CalendarFeedRow & { providerType: CalendarProviderType | null },
): Promise<SyncedEvent[]> {
  if (!feed.providerType) {
    throw new Error(
      `pollCalendarFeed: feed ${feed.id} has null providerType`,
    );
  }
  const handler = HANDLERS[feed.providerType];
  if (!handler) {
    throw new Error(
      `pollCalendarFeed: no handler for providerType=${feed.providerType}`,
    );
  }
  return handler({ id: feed.id, url: feed.url, name: feed.name });
}
