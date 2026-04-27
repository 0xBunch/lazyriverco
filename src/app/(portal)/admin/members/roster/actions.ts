"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MAX_BLURB_LENGTH = 4000;
const MAX_FIELD_LENGTH = 200;

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Update a member's curated context: displayName, role, and the
 * admin-curated facts (blurb, city, favoriteTeam). Server-action gated
 * by requireAdmin. Throws on validation failure.
 */
export async function updateMember(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = formData.get("id");
  const displayName = formData.get("displayName");
  const roleRaw = formData.get("role");

  if (typeof id !== "string" || !id) {
    throw new Error("Missing member id");
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new Error("Display name is required");
  }

  const blurb = trimOrNull(formData.get("blurb"));
  const city = trimOrNull(formData.get("city"));
  const favoriteTeam = trimOrNull(formData.get("favoriteTeam"));

  if (blurb && blurb.length > MAX_BLURB_LENGTH) {
    throw new Error(`Blurb too long (max ${MAX_BLURB_LENGTH})`);
  }
  if (city && city.length > MAX_FIELD_LENGTH) {
    throw new Error(`City too long (max ${MAX_FIELD_LENGTH})`);
  }
  if (favoriteTeam && favoriteTeam.length > MAX_FIELD_LENGTH) {
    throw new Error(`Favorite team too long (max ${MAX_FIELD_LENGTH})`);
  }

  // Role: only allow MEMBER/ADMIN. Refuse to demote yourself — prevents
  // the only-admin lockout where a commish accidentally turns themselves
  // into a member and locks the room.
  let role: Role | undefined;
  if (typeof roleRaw === "string") {
    if (roleRaw !== "MEMBER" && roleRaw !== "ADMIN") {
      throw new Error("Invalid role");
    }
    if (id === admin.id && roleRaw === "MEMBER") {
      throw new Error(
        "Can't demote yourself — promote another admin first",
      );
    }
    role = roleRaw;
  }

  await prisma.user.update({
    where: { id },
    data: {
      displayName: displayName.trim(),
      blurb,
      city,
      favoriteTeam,
      ...(role ? { role } : {}),
    },
  });

  revalidatePath("/admin/members/roster");
}
