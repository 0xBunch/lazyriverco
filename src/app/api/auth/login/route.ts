import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie, signToken } from "@/lib/session";

export const runtime = "nodejs";

// Pre-computed bcrypt hash of "not-a-real-password" at cost 12.
// Used as a fallback target when a user is not found or has a null passwordHash,
// so that wrong-username timing matches wrong-password timing.
const DUMMY_HASH = "$2a$12$/ngyx3l5E2czW4kNW2P53.8CTuh7EstKRrUCmumE0lZaUdJIXBsC.";

const INVALID_CREDENTIALS = { error: "Invalid credentials" } as const;

function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Same-origin fetches from server components can omit Origin;
    // treat missing Origin as allowed for first-party flows.
    return true;
  }
  // Behind Railway/Vercel/etc edge proxies, req.nextUrl.host reflects the
  // internal container host, NOT the public hostname the client actually
  // talked to. Prefer x-forwarded-host → host header → parsed URL fallback.
  const forwardedHost =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    req.nextUrl.host;
  try {
    return new URL(origin).host === forwardedHost;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!isOriginAllowed(req)) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    // Still run dummy compare so this branch has the same latency.
    await bcrypt.compare("x", DUMMY_HASH);
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { name: username } });
  const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
  const ok = await bcrypt.compare(password, hashToCompare);

  if (!ok || !user || !user.passwordHash) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const token = await signToken({
    userId: user.id,
    epoch: user.sessionEpoch,
    issuedAt: Date.now(),
  });

  return NextResponse.json(
    { ok: true, redirect: "/chat" },
    {
      status: 200,
      headers: { "Set-Cookie": buildSessionCookie(token) },
    },
  );
}
