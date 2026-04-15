import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  CURRENT_SEASON,
  type PoolPlayerDTO,
  type PoolResponse,
  type AddPlayerRequest,
} from "@/lib/draft";

export const runtime = "nodejs";

function requireAuth(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function requireAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  const authError = requireAuth(user);
  if (authError) return authError;
  if (user!.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const user = await getCurrentUser();
  const authError = requireAuth(user);
  if (authError) return authError;

  const rows = await prisma.playerPool.findMany({
    where: { season: CURRENT_SEASON },
    orderBy: [{ drafted: "asc" }, { playerName: "asc" }],
  });
  const players: PoolPlayerDTO[] = rows.map((r) => ({
    id: r.id,
    playerName: r.playerName,
    position: r.position,
    team: r.team,
    tagline: r.tagline,
    drafted: r.drafted,
  }));
  const res: PoolResponse = { season: CURRENT_SEASON, players };
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const adminError = requireAdmin(user);
  if (adminError) return adminError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as Partial<AddPlayerRequest>;
  const playerName = typeof b.playerName === "string" ? b.playerName.trim() : "";
  const position = typeof b.position === "string" ? b.position.trim() : "";
  const team = typeof b.team === "string" ? b.team.trim() : "";
  const tagline =
    typeof b.tagline === "string" && b.tagline.trim()
      ? b.tagline.trim()
      : null;

  if (!playerName || !position || !team) {
    return NextResponse.json(
      { error: "playerName, position, team required" },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.playerPool.create({
      data: {
        playerName,
        position,
        team,
        tagline,
        drafted: false,
        season: CURRENT_SEASON,
      },
    });
    return NextResponse.json(
      {
        player: {
          id: created.id,
          playerName: created.playerName,
          position: created.position,
          team: created.team,
          tagline: created.tagline,
          drafted: created.drafted,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    // Unique constraint on (playerName, season)
    return NextResponse.json(
      { error: "Player already in this season's pool" },
      { status: 409 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  const adminError = requireAdmin(user);
  if (adminError) return adminError;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "`id` required" }, { status: 400 });
  }

  const existing = await prisma.playerPool.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if (existing.drafted) {
    return NextResponse.json(
      { error: "Cannot delete a drafted player" },
      { status: 409 },
    );
  }

  await prisma.playerPool.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
