"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Admin actions for /admin/sports/mlf/draft. Matches the /admin/memory/feeds pattern —
// plain `<form action={...}>` server actions with ?msg= / ?error= flash
// redirects so the page can render the outcome without client state.
//
// v1 scope: create new draft + update top-level config (name, clock,
// rounds/slots). Slot-to-user mapping, sponsor management, image-pool
// uploads, live cockpit controls — follow-up PRs. Rule of thumb: if it
// writes to DraftRoom's own columns, it's in this file; if it writes
// to a child table (DraftSlot, DraftSponsor, DraftAnnouncerImage,
// DraftPick), it goes in a subroute actions.ts.

const MAX_NAME = 120;
const MAX_SLUG = 64;
const MAX_SEASON = 8;
const SLUG_PATTERN = /^[a-z0-9-]{2,64}$/;

function flash(path: string, key: "msg" | "error", value: string): never {
  const q = new URLSearchParams({ [key]: value }).toString();
  redirect(`${path}?${q}`);
}

// ---------------------------------------------------------------------------

export async function createDraft(fd: FormData): Promise<void> {
  const admin = await requireAdmin();

  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const season = String(fd.get("season") ?? "").trim();
  const totalRounds = Number(fd.get("totalRounds") ?? 3);
  const totalSlots = Number(fd.get("totalSlots") ?? 8);
  const pickClockHours = Number(fd.get("pickClockHours") ?? 24);

  if (!SLUG_PATTERN.test(slug)) {
    flash("/admin/sports/mlf/draft", "error", "Slug must be 2–64 chars, lowercase letters / digits / hyphens.");
  }
  if (!name || name.length > MAX_NAME) {
    flash("/admin/sports/mlf/draft", "error", `Name is required (max ${MAX_NAME} chars).`);
  }
  if (!season || season.length > MAX_SEASON) {
    flash("/admin/sports/mlf/draft", "error", `Season is required (max ${MAX_SEASON} chars, e.g. "2026").`);
  }
  if (!Number.isFinite(totalRounds) || totalRounds < 1 || totalRounds > 20) {
    flash("/admin/sports/mlf/draft", "error", "Rounds must be between 1 and 20.");
  }
  if (!Number.isFinite(totalSlots) || totalSlots < 2 || totalSlots > 32) {
    flash("/admin/sports/mlf/draft", "error", "Slots must be between 2 and 32.");
  }
  if (!Number.isFinite(pickClockHours) || pickClockHours < 1 || pickClockHours > 168) {
    flash("/admin/sports/mlf/draft", "error", "Pick clock must be between 1 and 168 hours (7 days).");
  }

  const existing = await prisma.draftRoom.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) {
    flash("/admin/sports/mlf/draft", "error", `A draft with slug "${slug}" already exists.`);
  }

  const draft = await prisma.draftRoom.create({
    data: {
      slug,
      name,
      season,
      totalRounds: Math.floor(totalRounds),
      totalSlots: Math.floor(totalSlots),
      pickClockSec: Math.floor(pickClockHours * 3600),
      createdBy: admin.id,
    },
    select: { id: true, slug: true },
  });

  revalidatePath("/admin/sports/mlf/draft");
  redirect(`/admin/sports/mlf/draft/${draft.id}?msg=created`);
}

export async function deleteDraft(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) flash("/admin/sports/mlf/draft", "error", "Missing draft id.");

  const confirm = String(fd.get("confirm") ?? "").trim();
  if (confirm !== "DELETE") {
    flash("/admin/sports/mlf/draft", "error", "Type DELETE to confirm draft removal.");
  }

  // Cascade: DraftSlot, DraftPick, DraftPoolPlayer, DraftAnnouncerImage,
  // DraftSponsor all delete with the parent DraftRoom per the migration's
  // ON DELETE CASCADE policy. Scouting reports survive (player-scoped).
  await prisma.draftRoom.delete({ where: { id } });

  revalidatePath("/admin/sports/mlf/draft");
  redirect("/admin/sports/mlf/draft?msg=deleted");
}
