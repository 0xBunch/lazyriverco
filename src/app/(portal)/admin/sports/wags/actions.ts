"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { Prisma, type SportTag } from "@prisma/client";
import { sanitizeInstagramHandle } from "@/lib/social/instagram";
import {
  sanitizeLooseImageUrl,
  sanitizeSourceUrl,
} from "@/lib/url-sanitize";
import { isValidWagKey } from "@/lib/r2";
import {
  generatePartnerByName,
  isPartnersEnabled,
  type PartnerLookupResult,
} from "@/lib/player-partner";
import { assertWithinLimit, RateLimitError } from "@/lib/rate-limit";

// Admin actions for /admin/sports/wags — CRUD on SportsWag, the
// curated cross-sport partner roster surfaced on /sports as the WAG
// of the Day. Mirrors the shape of /admin/memory/feeds/actions.ts:
// requireAdmin → validate → prisma write → revalidatePath → flash
// redirect. Plain `<form action>` invocations, no client component.

const MAX_NAME = 120;
const MAX_ATHLETE = 120;
const MAX_TEAM = 80;
const MAX_URL = 2048;
const MAX_SOURCE_URL = 512;
const MAX_HANDLE = 80;
const MAX_CAPTION = 280;
const MAX_NOTABLE = 240;
const MAX_R2_KEY = 200;
const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const satisfies readonly SportTag[];
const CONFIDENCE = ["low", "medium", "high"] as const;
type Confidence = (typeof CONFIDENCE)[number];

function narrowConfidence(raw: string): Confidence {
  return CONFIDENCE.includes(raw as Confidence) ? (raw as Confidence) : "high";
}

/// Resolve or create the canonical Athlete row for a (name, sport, team)
/// tuple, then return its id. Called from create/update/promote so every
/// new SportsWag row carries an athleteId.
///
/// `findFirst` rather than `findUnique`: Postgres treats NULL as distinct
/// in regular unique indexes, so the composite `(fullName, sport, team)`
/// can't match a team=null row via Prisma's findUnique. The findFirst
/// pattern with explicit `team: null` translates to `team IS NULL` and
/// works for both null and non-null team strings.
///
/// Race: two concurrent admin saves for the same (name, sport, team)
/// can both miss the findFirst and both call create. Migration
/// `20260430120000` adds a partial unique index for the team-IS-NULL
/// case so the second create raises P2002. We catch it and re-run
/// findFirst — at that point the first insert is committed, so the
/// row is visible.
async function resolveAthleteId(
  athleteName: string,
  sport: SportTag,
  team: string | null,
): Promise<string> {
  const existing = await prisma.athlete.findFirst({
    where: {
      fullName: athleteName,
      sport,
      team,
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await prisma.athlete.create({
      data: {
        fullName: athleteName,
        sport,
        team,
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const racer = await prisma.athlete.findFirst({
        where: { fullName: athleteName, sport, team },
        select: { id: true },
      });
      if (racer) return racer.id;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------

export async function createWag(fd: FormData): Promise<void> {
  await requireAdmin();

  const parsed = parseWagFormData(fd);
  if ("error" in parsed) return back({ error: parsed.error });

  try {
    const athleteId = await resolveAthleteId(
      parsed.athleteName,
      parsed.sport,
      parsed.team,
    );
    await prisma.sportsWag.create({
      data: {
        name: parsed.name,
        athleteId,
        athleteName: parsed.athleteName,
        sport: parsed.sport,
        team: parsed.team,
        imageUrl: parsed.imageUrl,
        imageR2Key: parsed.imageR2Key,
        instagramHandle: parsed.instagramHandle,
        caption: parsed.caption,
        notableFact: parsed.notableFact,
        sourceUrl: parsed.sourceUrl,
        confidence: parsed.confidence,
        // Only stamp on create if the admin used auto-fill in this
        // session; null otherwise (admin can still save manually).
        checkedAt: parsed.checkedAt,
      },
    });
  } catch (e) {
    console.error("createWag failed", e);
    return back({ error: "Couldn't save the WAG." });
  }

  revalidatePath("/admin/sports/wags");
  revalidatePath("/admin/sports/wags/queue");
  revalidatePath("/sports");
  return back({ msg: `Added ${parsed.name}.` });
}

// ---------------------------------------------------------------------------

export async function updateWag(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing WAG id." });

  const parsed = parseWagFormData(fd);
  if ("error" in parsed) return back({ error: parsed.error });

  try {
    const athleteId = await resolveAthleteId(
      parsed.athleteName,
      parsed.sport,
      parsed.team,
    );
    await prisma.sportsWag.update({
      where: { id },
      data: {
        name: parsed.name,
        athleteId,
        athleteName: parsed.athleteName,
        sport: parsed.sport,
        team: parsed.team,
        imageUrl: parsed.imageUrl,
        imageR2Key: parsed.imageR2Key,
        instagramHandle: parsed.instagramHandle,
        caption: parsed.caption,
        notableFact: parsed.notableFact,
        sourceUrl: parsed.sourceUrl,
        confidence: parsed.confidence,
        // Only refresh checkedAt when this save round-tripped through
        // auto-fill. Saving a row by hand without re-running auto-fill
        // shouldn't claim it was AI-verified again.
        ...(parsed.checkedAt ? { checkedAt: parsed.checkedAt } : {}),
      },
    });
  } catch (e) {
    console.error("updateWag failed", e);
    return back({ error: "Couldn't update the WAG." });
  }

  revalidatePath("/admin/sports/wags");
  revalidatePath("/admin/sports/wags/queue");
  revalidatePath("/sports");
  return back({ msg: `Updated ${parsed.name}.` });
}

type ParsedWag = {
  name: string;
  athleteName: string;
  sport: SportTag;
  team: string | null;
  imageUrl: string;
  imageR2Key: string | null;
  instagramHandle: string | null;
  caption: string | null;
  notableFact: string | null;
  sourceUrl: string | null;
  confidence: Confidence;
  /// ISO timestamp from the form's hidden aiCheckedAt input. Set when
  /// the admin used auto-fill in the same form session. Null when the
  /// admin saved without running auto-fill.
  checkedAt: Date | null;
};

function parseWagFormData(fd: FormData): ParsedWag | { error: string } {
  const name = readField(fd, "name", MAX_NAME);
  const athleteName = readField(fd, "athleteName", MAX_ATHLETE);
  const sportRaw = (fd.get("sport") ?? "").toString();
  const team = readOptionalField(fd, "team", MAX_TEAM);
  const imageUrlRaw = readField(fd, "imageUrl", MAX_URL);
  const imageR2KeyRaw = readOptionalField(fd, "imageR2Key", MAX_R2_KEY);
  const instagramRaw = readOptionalField(fd, "instagramHandle", MAX_HANDLE);
  const caption = readOptionalField(fd, "caption", MAX_CAPTION);
  const notableFact = readOptionalField(fd, "notableFact", MAX_NOTABLE);
  const sourceUrlRaw = readOptionalField(fd, "sourceUrl", MAX_SOURCE_URL);
  const confidenceRaw = (fd.get("confidence") ?? "high").toString();

  if (!name) return { error: "Partner name is required." };
  if (!athleteName) return { error: "Athlete name is required." };
  if (!SPORTS.includes(sportRaw as SportTag)) {
    return { error: "Sport must be one of NFL/NBA/MLB/NHL/MLS/UFC." };
  }
  const imageUrl = sanitizeLooseImageUrl(imageUrlRaw);
  if (!imageUrl) {
    return { error: "Image URL must be a valid http(s) URL." };
  }
  let imageR2Key: string | null = null;
  if (imageR2KeyRaw) {
    if (!isValidWagKey(imageR2KeyRaw)) {
      return {
        error: "imageR2Key isn't a valid wags/<uuid>.<ext> key.",
      };
    }
    imageR2Key = imageR2KeyRaw;
  }
  let instagramHandle: string | null = null;
  if (instagramRaw) {
    instagramHandle = sanitizeInstagramHandle(instagramRaw);
    if (!instagramHandle) {
      return {
        error: "Instagram must be a handle (no @) or an instagram.com URL.",
      };
    }
  }
  let sourceUrl: string | null = null;
  if (sourceUrlRaw) {
    sourceUrl = sanitizeSourceUrl(sourceUrlRaw);
    if (!sourceUrl) {
      return {
        error:
          "Source URL must be on the editorial allowlist (Wikipedia, ESPN, SI, etc.).",
      };
    }
  }
  const confidence = narrowConfidence(confidenceRaw);

  // Parse hidden aiCheckedAt. Empty string is the "no fresh AI check"
  // signal; an invalid date string is silently dropped to null.
  const checkedAtRaw = (fd.get("aiCheckedAt") ?? "").toString().trim();
  let checkedAt: Date | null = null;
  if (checkedAtRaw) {
    const d = new Date(checkedAtRaw);
    if (!Number.isNaN(d.getTime())) checkedAt = d;
  }

  return {
    name,
    athleteName,
    sport: sportRaw as SportTag,
    team,
    imageUrl,
    imageR2Key,
    instagramHandle,
    caption,
    notableFact,
    sourceUrl,
    confidence,
    checkedAt,
  };
}

// ---------------------------------------------------------------------------

export async function toggleWagHidden(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing WAG id." });

  const wag = await prisma.sportsWag.findUnique({
    where: { id },
    select: { hidden: true, name: true },
  });
  if (!wag) return back({ error: "WAG not found." });

  await prisma.sportsWag.update({
    where: { id },
    data: { hidden: !wag.hidden },
  });
  revalidatePath("/admin/sports/wags");
  revalidatePath("/admin/sports/wags/queue");
  return back({ msg: wag.hidden ? `${wag.name} unhidden.` : `${wag.name} hidden.` });
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

export type WagLookupResponse =
  | { ok: true; result: PartnerLookupResult }
  | { ok: false; error: string };

/// Admin auto-fill action. Runs the same Gemini + Google Search pipeline
/// the public WAGFINDER uses, but takes a free-form athlete name + sport
/// (so cross-sport works) and returns the result for the form to merge
/// in. Does NOT persist — admin reviews and submits via createWag.
export async function lookupWagDraft(fd: FormData): Promise<WagLookupResponse> {
  const admin = await requireAdmin();
  if (!isPartnersEnabled()) {
    return { ok: false, error: "WAGFINDER is disabled (SLEEPER_PARTNERS_ENABLED)." };
  }

  const athleteName = readField(fd, "athleteName", MAX_ATHLETE);
  const sportRaw = (fd.get("sport") ?? "").toString();
  const team = readOptionalField(fd, "team", MAX_TEAM);

  if (!athleteName) return { ok: false, error: "Athlete name is required." };
  if (!SPORTS.includes(sportRaw as SportTag)) {
    return { ok: false, error: "Pick a sport before running auto-fill." };
  }

  try {
    await assertWithinLimit(admin.id, "wag.lookup", {
      maxPerMinute: 5,
      maxPerDay: 30,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        ok: false,
        error: `Rate limit exceeded — try again in ${err.retryAfterSeconds}s.`,
      };
    }
    throw err;
  }

  let result: PartnerLookupResult | null;
  try {
    result = await generatePartnerByName(athleteName, {
      sport: sportRaw,
      team,
      logKey: `admin.wag.lookup:${athleteName}`,
    });
  } catch (err) {
    console.error("lookupWagDraft failed", err);
    return { ok: false, error: "Lookup failed — check server logs." };
  }
  if (!result) {
    return { ok: false, error: "No usable result from the search." };
  }
  return { ok: true, result };
}

// ---------------------------------------------------------------------------

/// Admin-only "promote a WAGFINDER hit to the SportsWag roster" action.
/// Reads the cached PlayerPartnerInfo for the player, finds-or-creates
/// the canonical Athlete, creates a hidden SportsWag draft, and
/// redirects to the queue for editorial review. Hidden so a half-filled
/// row doesn't leak onto /sports before KB has eyes on it.
export async function promotePartnerToWag(fd: FormData): Promise<void> {
  await requireAdmin();

  const playerId = (fd.get("playerId") ?? "").toString().trim();
  if (!playerId) return back({ error: "Missing playerId." });

  const partner = await prisma.playerPartnerInfo.findUnique({
    where: { playerId },
  });
  if (!partner || !partner.name || partner.relationship === "not_found") {
    return back({
      error: "No usable partner row for that player. Run WAGFINDER first.",
    });
  }
  if (!partner.imageUrl) {
    return back({
      error:
        "WAGFINDER found this person but no image. Add one manually before promoting.",
    });
  }
  const player = await prisma.sleeperPlayer.findUnique({
    where: { playerId },
    select: { fullName: true, firstName: true, lastName: true, team: true },
  });
  if (!player) return back({ error: "Sleeper player not found." });

  const athleteFullName =
    player.fullName ??
    [player.firstName, player.lastName].filter(Boolean).join(" ").trim();
  if (!athleteFullName) {
    return back({ error: "Couldn't resolve athlete name." });
  }

  // Find-or-create the canonical Athlete, attach the Sleeper id when we
  // create. We never overwrite an existing athleteRow.sleeperPlayerId
  // (the unique index would block a duplicate anyway).
  let athleteId: string;
  const existingAthlete = await prisma.athlete.findUnique({
    where: { sleeperPlayerId: playerId },
    select: { id: true },
  });
  if (existingAthlete) {
    athleteId = existingAthlete.id;
  } else {
    const created = await prisma.athlete.create({
      data: {
        fullName: athleteFullName,
        sport: "NFL",
        team: player.team ?? null,
        sleeperPlayerId: playerId,
      },
      select: { id: true },
    });
    athleteId = created.id;
  }

  try {
    const wag = await prisma.sportsWag.create({
      data: {
        name: partner.name,
        athleteId,
        athleteName: athleteFullName,
        sport: "NFL",
        team: player.team,
        imageUrl: partner.imageUrl,
        instagramHandle: partner.instagramHandle,
        caption: partner.notableFact?.slice(0, 280) ?? null,
        notableFact: partner.notableFact,
        sourceUrl: partner.sourceUrl,
        confidence: narrowConfidence(partner.confidence),
        checkedAt: new Date(),
        hidden: true,
      },
    });
    revalidatePath("/admin/sports/wags");
    revalidatePath("/admin/sports/wags/queue");
    redirect(`/admin/sports/wags?edit=${wag.id}&msg=${encodeURIComponent(
      `Drafted ${partner.name} (hidden). Review and unhide to publish.`,
    )}`);
  } catch (e) {
    // Next.js redirect throws — let it propagate.
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest?: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    console.error("promotePartnerToWag failed", e);
    return back({ error: "Couldn't create the draft." });
  }
}

// ---------------------------------------------------------------------------

export async function deleteWag(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing WAG id." });

  try {
    // SportsWagFeature rows referencing this WAG cascade-delete per
    // the schema's onDelete: Cascade.
    await prisma.sportsWag.delete({ where: { id } });
  } catch (e) {
    console.error("deleteWag failed", e);
    return back({ error: "Couldn't delete the WAG." });
  }
  revalidatePath("/admin/sports/wags");
  revalidatePath("/admin/sports/wags/queue");
  return back({ msg: "WAG deleted." });
}

// ---------------------------------------------------------------------------

function readField(fd: FormData, key: string, max: number): string {
  return (fd.get(key) ?? "").toString().trim().slice(0, max);
}

function readOptionalField(
  fd: FormData,
  key: string,
  max: number,
): string | null {
  const v = readField(fd, key, max);
  return v.length > 0 ? v : null;
}

function back(flash: { msg?: string; error?: string }): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  const qs = params.toString();
  redirect(qs ? `/admin/sports/wags?${qs}` : "/admin/sports/wags");
}
