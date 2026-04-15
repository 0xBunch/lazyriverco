import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  AUTHOR_SELECT,
  toDTO,
  type ChatMessageDTO,
  type ConversationDetailDTO,
  type GetConversationResponse,
} from "@/lib/chat";

export const runtime = "nodejs";

// Same narrow character select as the list route — keeps systemPrompt
// out of any client-bound payload.
const CHARACTER_SELECT = {
  id: true,
  name: true,
  displayName: true,
  avatarUrl: true,
} as const;

/**
 * GET /api/conversations/[id] — load a single conversation with its
 * full message history, ordered oldest → newest. 404 (not 403) on any
 * non-owner hit so we don't leak conversation existence.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<GetConversationResponse>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json<GetConversationResponse>(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Ownership-scoped findFirst: a non-owner gets null back, translated
  // to 404 below. Never 403 — don't confirm the id exists.
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.id,
      ownerId: user.id,
      archivedAt: null,
    },
    include: {
      character: { select: CHARACTER_SELECT },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: AUTHOR_SELECT },
          character: { select: AUTHOR_SELECT },
        },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json<GetConversationResponse>(
      { error: "Not found" },
      { status: 404 },
    );
  }

  // Load the active-character allowlist so the sentinel parser can
  // promote any valid <suggest-agent> handoff in CHARACTER messages
  // into `suggestion` on the DTO.
  const activeCharacters = await prisma.character.findMany({
    where: { active: true },
    select: { name: true },
  });
  const allowlist = activeCharacters.map((c) => c.name);

  const messages: ChatMessageDTO[] = conversation.messages
    .map((m) => toDTO(m, allowlist))
    .filter((m): m is ChatMessageDTO => m !== null);

  const detail: ConversationDetailDTO = {
    id: conversation.id,
    title: conversation.title,
    character: conversation.character,
    messages,
    createdAt: conversation.createdAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
  };

  return NextResponse.json<GetConversationResponse>(
    { conversation: detail },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * DELETE /api/conversations/[id] — soft-delete via archivedAt. The
 * ownership check is baked into the updateMany where clause, so a
 * non-owner gets 404 (count === 0) instead of a silent no-op success.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await prisma.conversation.updateMany({
    where: {
      id: params.id,
      ownerId: user.id,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
