import Link from "next/link";
import { getPlayerProfile, isSleeperEnabled, type PlayerProfile } from "@/lib/sleeper";
import { isPartnersEnabled } from "@/lib/player-partner";
import { PlayerProfileView } from "../players/[playerId]/PlayerProfileView";

// Right-side draft-room dossier. Reuses PlayerProfileView so the dossier
// panel and the standalone /sports/mlf/players/[playerId] page stay in
// lockstep — bug fixes and stat additions to one show up in the other.
//
// Server component. Fetches the profile inline; if Sleeper is disabled
// or the lookup fails, renders a small fallback so the rest of the
// draft-room layout doesn't shift.

const NAVY_700 = "#1B3A66";
const NAVY_900 = "#0B1A33";
const CREAM_200 = "#C6BEAC";
const CREAM_400 = "#8A8372";

export async function Dossier({ playerId }: { playerId: string }) {
  if (!isSleeperEnabled()) {
    return (
      <DossierShell>
        <p className="text-[13px]" style={{ color: CREAM_200 }}>
          Player lookups are paused (set SLEEPER_ENABLED=true).
        </p>
      </DossierShell>
    );
  }

  let profile: PlayerProfile;
  try {
    profile = await getPlayerProfile(playerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lookup failed.";
    return (
      <DossierShell>
        <p className="text-[13px]" style={{ color: CREAM_200 }}>
          Couldn&rsquo;t load this player. {msg}
        </p>
      </DossierShell>
    );
  }

  return (
    <DossierShell>
      <PlayerProfileView profile={profile} partnersEnabled={isPartnersEnabled()} />
    </DossierShell>
  );
}

function DossierShell({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className="flex flex-col gap-4 rounded-sm border p-5 md:sticky md:top-4"
      style={{
        borderColor: NAVY_700,
        backgroundColor: `${NAVY_900}CC`,
        // Cap height on desktop so the inner profile scrolls instead of
        // shoving the BigBoard into the void.
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
      }}
    >
      <header className="flex items-center justify-between gap-3">
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: CREAM_200 }}
        >
          Dossier
        </h2>
        <Link
          href="?"
          aria-label="Close dossier"
          scroll={false}
          className="-m-2 flex h-8 w-8 items-center justify-center rounded-sm transition hover:brightness-125 focus:outline-none"
          style={{ color: CREAM_400 }}
        >
          ✕
        </Link>
      </header>
      {children}
    </aside>
  );
}
