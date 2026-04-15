import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

// Presence-only check. Real cryptographic verification (HMAC + session
// epoch) lives in src/lib/auth.ts `getCurrentUser()`, which runs in the
// Node runtime where Prisma + Web Crypto both work reliably. Middleware
// runs in Edge Runtime which has quirks around env var access for HMAC
// secrets — doing signature verification here caused freshly-minted
// cookies to be rejected in Railway's edge isolation (verified on
// lazyriverco-production.up.railway.app). This split is the standard
// Clerk/NextAuth pattern: middleware is a cheap gate, server components
// and API handlers are the real enforcement layer.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/sign-in", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Allowlist: Next internals, sign-in page, ALL /api/auth/* routes
  // (login, logout, and any future session endpoints), and the PWA
  // chrome (favicon, app icons, manifest) which must be reachable
  // before the user authenticates. Everything else hits the auth check
  // above.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sign-in|api/auth/).*)",
  ],
};
