import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifyToken } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;

  if (!payload) {
    const url = new URL("/sign-in", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sign-in|api/auth/login|api/auth/logout).*)",
  ],
};
