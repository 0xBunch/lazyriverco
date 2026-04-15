import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifyToken } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;

  if (!payload) {
    // API routes: return 401 JSON so client fetches can handle the failure.
    // Page routes: redirect to the sign-in screen.
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
