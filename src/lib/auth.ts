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

/**
 * Trip-wire for mini-app routes (fantasy / picks / brackets / trips /
 * etc.) that currently render placeholder pages. Called from the page's
 * server component NOW even though it does nothing — so when a route
 * upgrades to real data, the author changes ONE line here and every
 * mini-app becomes admin-gated at once. grep callers for the full set.
 *
 * Currently a no-op: phase-1 placeholders are safe to show to any
 * signed-in user. When real data lands, change the body to:
 *
 *     const user = await getCurrentUser();
 *     if (user?.role !== "ADMIN") notFound();
 *
 * and import `notFound` from "next/navigation".
 */
export async function requireAdminOrPlaceholder(): Promise<void> {
  // Intentional no-op — see doc comment above. Keep the import / call
  // site in every mini-app page.tsx so flipping this on gates them all.
}
