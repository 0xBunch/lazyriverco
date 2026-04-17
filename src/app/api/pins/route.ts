import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

type PinBody = { conversationId?: unknown };

type PinResponse = { ok: true } | { error: string };

function parseConversationId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as PinBody).conversationId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readJsonBody(req: NextRequest): Promise<unknown | null> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * POST /api/pins — pin a conversation to the sidebar's Starred section.
 * Idempotent: pinning an already-pinned conversation returns 200 without
 * creating a duplicate row (unique index on (userId, conversationId)).
 *
 * Body: `{ conversationId: string }`
 *
 * Only conversation pins are wired today; character pins are provisioned
 * in the schema for a future "starred agents" surface.
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<PinResponse>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(req);
  if (body === null) {
    return NextResponse.json(
      { error: "Expected application/json" },
      { status: 415 },
    );
  }

  const conversationId = parseConversationId(body);
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  // Ownership check — never pin someone else's conversation. Also filters
  // out archived ones; pinning an archived thread would dangle a
  // dangling-feeling entry in the sidebar.
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, ownerId: user.id, archivedAt: null },
    select: { id: true },
  });
  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  try {
    await prisma.pin.create({
      data: {
        userId: user.id,
        conversationId,
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation (already pinned). Treat as
    // success — POST /api/pins is idempotent by design.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

/**
 * DELETE /api/pins — unpin a conversation. Idempotent: deleting a pin
 * that doesn't exist returns 200.
 *
 * Body: `{ conversationId: string }`
 */
export async function DELETE(
  req: NextRequest,
): Promise<NextResponse<PinResponse>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(req);
  if (body === null) {
    return NextResponse.json(
      { error: "Expected application/json" },
      { status: 415 },
    );
  }

  const conversationId = parseConversationId(body);
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  // deleteMany is idempotent — count=0 when no match, never throws P2025.
  // Scoped to (userId, conversationId) so you can't erase another user's
  // pin even if you knew the target id.
  await prisma.pin.deleteMany({
    where: { userId: user.id, conversationId },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
