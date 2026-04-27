"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { SportTag } from "@prisma/client";

const MAX_TITLE = 280;
const MAX_CHANNEL = 120;
const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const satisfies readonly SportTag[];

// Match common YouTube URL shapes:
//   - https://www.youtube.com/watch?v=<11-char-id>
//   - https://youtu.be/<11-char-id>
//   - https://www.youtube.com/shorts/<11-char-id>
//   - https://www.youtube.com/embed/<11-char-id>
// Returns the 11-char video ID or null.
function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // If it's already an 11-char alphanumeric/dash/underscore id, accept it.
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------

export async function createHighlight(fd: FormData): Promise<void> {
  await requireAdmin();

  const youtubeRaw = (fd.get("youtubeUrl") ?? "").toString();
  const title = (fd.get("title") ?? "").toString().trim().slice(0, MAX_TITLE);
  const channel = (fd.get("channel") ?? "").toString().trim().slice(0, MAX_CHANNEL);
  const sportRaw = (fd.get("sport") ?? "").toString();
  const sortOrderRaw = Number(fd.get("sortOrder") ?? 0);
  const durationStr = (fd.get("durationSec") ?? "").toString().trim();
  const durationSec = durationStr ? Number(durationStr) : null;

  const videoId = extractYouTubeVideoId(youtubeRaw);
  if (!videoId) return back({ error: "Invalid YouTube URL or video ID." });
  if (!title) return back({ error: "Title is required." });
  if (!channel) return back({ error: "Channel is required." });
  if (!SPORTS.includes(sportRaw as SportTag)) {
    return back({ error: "Sport must be one of NFL/NBA/MLB/NHL/MLS/UFC." });
  }
  if (durationSec !== null && (!Number.isFinite(durationSec) || durationSec < 0)) {
    return back({ error: "Duration must be a non-negative integer (seconds)." });
  }

  // YouTube serves hqdefault.jpg for any video at this URL; no API key
  // needed. The /sports page ships <img> with the no-img-element disable
  // — the YouTube CDN host is allow-listed neither in next.config nor a
  // proxy, but the disabled <img> tag bypasses the Next.js optimizer.
  const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    await prisma.sportsHighlight.create({
      data: {
        youtubeVideoId: videoId,
        title,
        channel,
        thumbUrl,
        durationSec,
        publishedAt: new Date(),
        sport: sportRaw as SportTag,
        sortOrder: Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0,
      },
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      return back({ error: "This YouTube video is already in the list." });
    }
    console.error("createHighlight failed", e);
    return back({ error: "Couldn't save the highlight." });
  }

  revalidatePath("/admin/sports/highlights");
  return back({ msg: `Added "${title}".` });
}

// ---------------------------------------------------------------------------

export async function toggleHighlightHidden(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing highlight id." });

  const h = await prisma.sportsHighlight.findUnique({
    where: { id },
    select: { hidden: true, title: true },
  });
  if (!h) return back({ error: "Highlight not found." });

  await prisma.sportsHighlight.update({
    where: { id },
    data: { hidden: !h.hidden },
  });
  revalidatePath("/admin/sports/highlights");
  return back({ msg: h.hidden ? `${h.title} unhidden.` : `${h.title} hidden.` });
}

export async function deleteHighlight(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing highlight id." });

  try {
    await prisma.sportsHighlight.delete({ where: { id } });
  } catch (e) {
    console.error("deleteHighlight failed", e);
    return back({ error: "Couldn't delete the highlight." });
  }
  revalidatePath("/admin/sports/highlights");
  return back({ msg: "Highlight deleted." });
}

// ---------------------------------------------------------------------------

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: unknown }).code === "P2002"
  );
}

function back(flash: { msg?: string; error?: string }): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  const qs = params.toString();
  redirect(qs ? `/admin/sports/highlights?${qs}` : "/admin/sports/highlights");
}
