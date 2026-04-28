import "server-only";
import { upsertSyncedEvents } from "./upsert";
import { nagerProvider } from "./nager";
import { usnoProvider } from "./usno";
import { espnNflProvider } from "./espn-nfl";
import type { CalendarProvider, ProviderResult } from "./types";

// Run every registered provider in parallel. One provider's network
// failure doesn't poison another's results — each is wrapped in its own
// try/catch and surfaces an error string in its ProviderResult.

const PROVIDERS: CalendarProvider[] = [
  nagerProvider,
  usnoProvider,
  espnNflProvider,
];

export async function runAllProviders(): Promise<ProviderResult[]> {
  return Promise.all(
    PROVIDERS.map(async (p): Promise<ProviderResult> => {
      try {
        const events = await p.fetch();
        const { upserted, errors } = await upsertSyncedEvents(events);
        return { provider: p.name, upserted, errors };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { provider: p.name, upserted: 0, errors: [msg] };
      }
    }),
  );
}

export type { ProviderResult } from "./types";
