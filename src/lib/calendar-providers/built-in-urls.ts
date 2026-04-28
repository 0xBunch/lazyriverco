import "server-only";
import type { CalendarProviderType } from "@prisma/client";

// Canonical URL for each built-in calendar provider.
//
// The corresponding INSERTs in the migration must match these strings
// verbatim:
//   prisma/migrations/20260428190100_calendar_feeds_unified/migration.sql
//   (lines ~80–105: the four `INSERT INTO "Feed" ... VALUES (...)`
//    rows for NAGER / USNO_MOON / USNO_SEASON / ESPN_NFL).
//
// Going forward this module is the single source of truth — any URL
// convention change updates here, and the migration becomes historical
// (Prisma migrations are forward-only). A new provider adds one entry
// here AND a new INSERT in a follow-up migration.
//
// `{yr}` is a literal placeholder shown to admins for transparency
// ("here's roughly what we hit at fetch time"). Provider code never
// substitutes against the stored URL — each handler constructs its own
// real URL from the current year and runs assertUrlSafePublic on that.
// The stored URL is identity-only.
export const BUILT_IN_CALENDAR_URLS: Record<
  Exclude<CalendarProviderType, "ICAL_URL">,
  string
> = {
  NAGER: "https://date.nager.at/api/v3/PublicHolidays/{yr}/US",
  USNO_MOON: "https://aa.usno.navy.mil/api/moon/phases/year?year={yr}",
  USNO_SEASON: "https://aa.usno.navy.mil/api/seasons?year={yr}",
  ESPN_NFL:
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
};
