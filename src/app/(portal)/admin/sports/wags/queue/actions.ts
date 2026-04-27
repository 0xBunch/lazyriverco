"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Admin actions for /admin/sports/wags/queue — date-keyed scheduling
// of which SportsWag features on which day. featureDate is unique
// (one WAG per date), so setFeature upserts and clearFeature deletes.

const MAX_CAPTION = 280;

export async function setFeature(fd: FormData): Promise<void> {
  await requireAdmin();

  const dateStr = (fd.get("featureDate") ?? "").toString();
  const wagId = (fd.get("wagId") ?? "").toString();
  const captionRaw = (fd.get("caption") ?? "").toString().trim().slice(0, MAX_CAPTION);
  const caption = captionRaw.length > 0 ? captionRaw : null;

  if (!dateStr) return back({ error: "Missing date." });
  if (!wagId) {
    // Empty wagId = "clear" — delete the row for this date if any.
    await prisma.sportsWagFeature.deleteMany({ where: { featureDate: parseDate(dateStr) } });
    revalidatePath("/admin/sports/wags/queue");
    return back({ msg: `Cleared ${dateStr}.` });
  }

  const wag = await prisma.sportsWag.findUnique({
    where: { id: wagId },
    select: { id: true, name: true },
  });
  if (!wag) return back({ error: "WAG not found." });

  const featureDate = parseDate(dateStr);
  if (!featureDate) return back({ error: "Invalid date." });

  try {
    await prisma.sportsWagFeature.upsert({
      where: { featureDate },
      create: { featureDate, wagId, caption },
      update: { wagId, caption },
    });
  } catch (e) {
    console.error("setFeature failed", e);
    return back({ error: "Couldn't save the feature." });
  }
  revalidatePath("/admin/sports/wags/queue");
  return back({ msg: `${wag.name} → ${dateStr}.` });
}

export async function clearFeature(fd: FormData): Promise<void> {
  await requireAdmin();

  const dateStr = (fd.get("featureDate") ?? "").toString();
  if (!dateStr) return back({ error: "Missing date." });

  const featureDate = parseDate(dateStr);
  if (!featureDate) return back({ error: "Invalid date." });

  await prisma.sportsWagFeature.deleteMany({ where: { featureDate } });
  revalidatePath("/admin/sports/wags/queue");
  return back({ msg: `Cleared ${dateStr}.` });
}

// `<input type="date">` posts an ISO-style YYYY-MM-DD string. Convert
// to a Date pinned at UTC midnight so the row matches the same key
// the public-page rotation queries (startOfUtcDay).
function parseDate(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(NaN);
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

function back(flash: { msg?: string; error?: string }): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  const qs = params.toString();
  redirect(qs ? `/admin/sports/wags/queue?${qs}` : "/admin/sports/wags/queue");
}
