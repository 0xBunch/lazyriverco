"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { ScheduleStatus, SportTag } from "@prisma/client";

const MAX_TEAM = 80;
const MAX_NETWORK = 32;
const MAX_URL = 2048;
const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const satisfies readonly SportTag[];
const STATUSES = ["SCHEDULED", "LIVE", "FINAL", "POSTPONED"] as const satisfies readonly ScheduleStatus[];

// ---------------------------------------------------------------------------

export async function createGame(fd: FormData): Promise<void> {
  await requireAdmin();

  const sportRaw = (fd.get("sport") ?? "").toString();
  const awayTeam = (fd.get("awayTeam") ?? "").toString().trim().slice(0, MAX_TEAM);
  const homeTeam = (fd.get("homeTeam") ?? "").toString().trim().slice(0, MAX_TEAM);
  const gameTimeStr = (fd.get("gameTime") ?? "").toString();
  const network = readOptional(fd, "network", MAX_NETWORK);
  const watchUrl = readOptional(fd, "watchUrl", MAX_URL);
  const statusRaw = (fd.get("status") ?? "SCHEDULED").toString();

  if (!SPORTS.includes(sportRaw as SportTag)) {
    return back({ error: "Sport must be one of NFL/NBA/MLB/NHL/MLS/UFC." });
  }
  if (!awayTeam) return back({ error: "Away team is required." });
  if (!homeTeam) return back({ error: "Home team is required." });
  if (awayTeam === homeTeam) {
    return back({ error: "Away and home teams must differ." });
  }
  if (!gameTimeStr) return back({ error: "Game time is required." });
  const gameTime = new Date(gameTimeStr);
  if (isNaN(gameTime.getTime())) {
    return back({ error: "Invalid game time." });
  }
  if (!STATUSES.includes(statusRaw as ScheduleStatus)) {
    return back({ error: "Status must be SCHEDULED/LIVE/FINAL/POSTPONED." });
  }
  if (watchUrl && !/^https?:\/\/.+/i.test(watchUrl)) {
    return back({ error: "Watch URL must start with http:// or https://" });
  }

  try {
    await prisma.sportsScheduleGame.create({
      data: {
        sport: sportRaw as SportTag,
        awayTeam,
        homeTeam,
        gameTime,
        network,
        watchUrl,
        status: statusRaw as ScheduleStatus,
      },
    });
  } catch (e) {
    console.error("createGame failed", e);
    return back({ error: "Couldn't save the game." });
  }

  revalidatePath("/admin/sports/schedule");
  return back({ msg: `Added ${awayTeam} @ ${homeTeam}.` });
}

// ---------------------------------------------------------------------------

export async function updateGameStatus(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  const statusRaw = (fd.get("status") ?? "").toString();
  if (!id) return back({ error: "Missing game id." });
  if (!STATUSES.includes(statusRaw as ScheduleStatus)) {
    return back({ error: "Invalid status." });
  }

  await prisma.sportsScheduleGame.update({
    where: { id },
    data: { status: statusRaw as ScheduleStatus },
  });
  revalidatePath("/admin/sports/schedule");
  return back({ msg: `Status → ${statusRaw}.` });
}

export async function toggleGameHidden(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing game id." });

  const g = await prisma.sportsScheduleGame.findUnique({
    where: { id },
    select: { hidden: true },
  });
  if (!g) return back({ error: "Game not found." });

  await prisma.sportsScheduleGame.update({
    where: { id },
    data: { hidden: !g.hidden },
  });
  revalidatePath("/admin/sports/schedule");
  return back({ msg: g.hidden ? "Unhidden." : "Hidden." });
}

export async function deleteGame(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing game id." });

  try {
    await prisma.sportsScheduleGame.delete({ where: { id } });
  } catch (e) {
    console.error("deleteGame failed", e);
    return back({ error: "Couldn't delete the game." });
  }
  revalidatePath("/admin/sports/schedule");
  return back({ msg: "Game deleted." });
}

// ---------------------------------------------------------------------------

function readOptional(fd: FormData, key: string, max: number): string | null {
  const v = (fd.get(key) ?? "").toString().trim().slice(0, max);
  return v.length > 0 ? v : null;
}

function back(flash: { msg?: string; error?: string }): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  const qs = params.toString();
  redirect(qs ? `/admin/sports/schedule?${qs}` : "/admin/sports/schedule");
}
