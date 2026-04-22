import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getPlayerProfile,
  isSleeperEnabled,
  type PlayerProfile,
} from "@/lib/sleeper";
import { isPartnersEnabled } from "@/lib/player-partner";
import { PlayerProfileView } from "./PlayerProfileView";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const dynamic = "force-dynamic";

type Params = { playerId: string };

export default async function PlayerProfilePage({
  params,
}: {
  params: Params;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/start");

  if (!isSleeperEnabled()) {
    return (
      <ModulePlaceholder
        icon="🏈"
        title="MLF lookups are paused."
        message="Set SLEEPER_ENABLED=true to view player profiles."
      />
    );
  }

  let profile: PlayerProfile;
  try {
    profile = await getPlayerProfile(params.playerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lookup failed";
    return (
      <ModulePlaceholder
        icon="🏈"
        title="Couldn't load this player."
        message={msg}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <nav className="mb-4 text-sm text-bone-400">
        <Link
          href="/sports/mlf"
          className="inline-flex items-center gap-1 rounded px-1 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
        >
          <span aria-hidden="true">←</span> MLF
        </Link>
      </nav>
      <PlayerProfileView
        profile={profile}
        partnersEnabled={isPartnersEnabled()}
      />
    </div>
  );
}
