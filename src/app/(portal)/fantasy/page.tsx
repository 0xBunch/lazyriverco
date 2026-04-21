import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLeagueOverview, isSleeperEnabled, SleeperError } from "@/lib/sleeper";
import { SleeperOverview } from "./SleeperOverview";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const dynamic = "force-dynamic";

export default async function FantasyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/start");

  if (!isSleeperEnabled()) {
    return (
      <ModulePlaceholder
        icon="🏈"
        title="MLF lookups are paused."
        message="Set SLEEPER_ENABLED=true and SLEEPER_LEAGUE_ID in the Railway env to light up this room."
      />
    );
  }

  try {
    const overview = await getLeagueOverview();
    return (
      <SleeperOverview
        initial={overview}
        isAdmin={user.role === "ADMIN"}
      />
    );
  } catch (err) {
    if (err instanceof SleeperError && err.code === "MISCONFIGURED") {
      return (
        <ModulePlaceholder
          icon="🏈"
          title="League ID missing."
          message="Set SLEEPER_LEAGUE_ID to the MLF Sleeper league id and reload."
        />
      );
    }
    const msg =
      err instanceof SleeperError
        ? err.message
        : "Sleeper is not responding right now. Try again in a minute.";
    return (
      <ModulePlaceholder
        icon="🏈"
        title="Couldn't reach Sleeper."
        message={msg}
      />
    );
  }
}
