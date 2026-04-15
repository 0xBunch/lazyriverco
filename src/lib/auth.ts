import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifyToken } from "@/lib/session";

// Safe user shape exposed to server components. `passwordHash` is intentionally
// omitted via `select` so it can never leak into RSC props or client bundles
// (security review N3). `SafeUser` is derived from the select so the type
// stays in sync automatically whenever the schema changes.
const userSelect = {
  id: true,
  name: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  sessionEpoch: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: userSelect,
  });
  if (!user) return null;

  // Reject stale cookies whose sessionEpoch no longer matches the DB.
  if (user.sessionEpoch !== payload.epoch) return null;

  return user;
});

export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

/**
 * Server-component / server-action gate: throws unless the current user
 * is signed in AND has role=ADMIN. Use at the top of every /admin route
 * and every admin server action so the check is enforced in one place.
 */
export async function requireAdmin(): Promise<SafeUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new Error("Forbidden — admin only");
  }
  return user;
}
