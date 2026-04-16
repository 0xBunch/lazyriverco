import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildClearCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // req.url resolves to localhost:8080 on Railway (internal container
  // port). Use x-forwarded-* headers from the reverse proxy to build
  // the public redirect URL.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost";
  const url = new URL("/sign-in", `${proto}://${host}`);
  return NextResponse.redirect(url, {
    status: 303,
    headers: { "Set-Cookie": buildClearCookie() },
  });
}
