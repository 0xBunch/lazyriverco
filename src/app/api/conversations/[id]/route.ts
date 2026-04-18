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

const TITLE_MAX_CHARS = 200;

type PatchBody = { title?: unknown; archived?: unknown };

type PatchParsed =
  | { title?: string; unarchive?: true }
  | { error: string };

function parsePatchBody(body: unknown): PatchParsed {
  if (typeof body !== "object" || body === null) {
    return { error: "Expected a JSON object" };
  }
  const { title: rawTitle, archived: rawArchived } = body as PatchBody;

  const out: { title?: string; unarchive?: true } = {};

  if (rawTitle !== undefined) {
    if (typeof rawTitle !== "string") {
      return { error: "title must be a string" };
    }
    const trimmed = rawTitle.trim();
    if (trimmed.length === 0) {
      return { error: "title must not be empty" };
    }
    if (trimmed.length > TITLE_MAX_CHARS) {
      return { error: `title must be ${TITLE_MAX_CHARS} chars or fewer` };
    }
    out.title = trimmed;
  }

  if (rawArchived !== undefined) {
    if (rawArchived !== false) {
      return { error: "archived must be false (use DELETE to archive)" };
    }
    out.unarchive = true;
  }

  if (out.title === undefined && !out.unarchive) {
    return { error: "At least one of title or archived is required" };
  }

  return out;
}

/**
 * PATCH /api/conversations/[id] — rename and/or unarchive. Body shape:
 *   { title?: string, archived?: false }
 * Both fields are optional but at least one is required. `archived: true`
 * is rejected — that's what DELETE is for. Title is trimmed and
 * length-capped to match Conversation.title's @db.VarChar(200).
 *
 * Ownership baked into the updateMany where clause; non-owner → 404.
 * Unlike DELETE, this handler does NOT filter by `archivedAt: null` —
 * unarchive needs to target archived rows, and rename should work on
 * either state.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parsePatchBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const data: { title?: string; archivedAt?: null } = {};
  if (parsed.title !== undefined) data.title = parsed.title;
  if (parsed.unarchive) data.archivedAt = null;

  const result = await prisma.conversation.updateMany({
    where: {
      id: params.id,
      ownerId: user.id,
    },
    data,
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
