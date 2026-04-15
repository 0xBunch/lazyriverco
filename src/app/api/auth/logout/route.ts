import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildClearCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const url = new URL("/sign-in", req.url);
  return NextResponse.redirect(url, {
    status: 303,
    headers: { "Set-Cookie": buildClearCookie() },
  });
}
