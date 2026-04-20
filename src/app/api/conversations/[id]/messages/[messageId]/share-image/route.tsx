import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { initialsOf } from "@/lib/initials";

export const runtime = "nodejs";
// Dynamic because the response depends on the session cookie (ownership
// check). Without this Next will try to statically cache the route.
export const dynamic = "force-dynamic";

// Canvas dimensions — 1200×630 is the OG / iMessage-preview standard and
// renders at a readable size inside iMessage bubbles without scaling.
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_CONTENT_CHARS = 650;

// Bone / claude tokens inlined — next/og doesn't run Tailwind, so colors
// must be raw values. Keep in sync with tailwind.config.ts if the design
// system shifts.
const COLORS = {
  bg: "#141311", // bone-950
  card: "#1E1D1C", // bone-900
  cardBorder: "#2F2E2C", // bone-700
  accent: "#D957A3", // claude-500
  accentSoft: "#E88CB0", // claude-300
  textPrimary: "#FAF9F5", // bone-50
  textSecondary: "#C6C2B5", // bone-200
  textTertiary: "#6E6B64", // bone-400
} as const;

// SSRF defense: only trust avatar URLs whose origin matches the media
// CDN. `next/og` fetches the URL server-side to rasterize it — a rogue
// avatar value (future user uploads, admin typo, migration bug) could
// otherwise point at an internal host or a huge asset and stall /
// probe the server. Mirrors the isSafeMediaUrl pattern in ChatMessage.tsx.
const AVATAR_ALLOWED_ORIGIN: string | null = (() => {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
})();

function isSafeAvatarUrl(raw: string | null): raw is string {
  if (!raw || !AVATAR_ALLOWED_ORIGIN) return false;
  try {
    const u = new URL(raw);
    return u.origin === AVATAR_ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Best-effort markdown → plain text for the OG card. We don't try to
 * preserve formatting — the goal is a readable single-block render that
 * fits in a 1200×630 card. Members who want fidelity should use "Copy".
 */
function stripMarkdown(raw: string): string {
  let text = raw;
  // Strip any HTML / XML-like tags first — covers `<suggest-agent>`
  // sentinels emitted by the orchestrator (normally stripped by
  // toDTO's parseSentinel; we bypass that path reading from the DB
  // directly), plus any stray inline HTML. OG text renders as literal
  // strings, so unstripped tags would show up verbatim in the card.
  text = text.replace(/<[^>]+>/g, "");
  // Code fences — keep the code, drop the backticks.
  text = text.replace(/```[\w-]*\n?/g, "").replace(/```/g, "");
  // Images ![alt](url) → alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links [text](url) → text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Inline code `code` → code
  text = text.replace(/`([^`]+)`/g, "$1");
  // Bold / italic **text** / *text* / __text__ / _text_ → text
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  // Headings / blockquotes / list markers at line start.
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^>\s?/gm, "");
  text = text.replace(/^(\s*)([-*+]|\d+\.)\s+/gm, "$1• ");
  // Collapse 3+ blank lines → 2.
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastBreak = Math.max(
    slice.lastIndexOf(" "),
    slice.lastIndexOf("\n"),
  );
  const cut = lastBreak > max * 0.7 ? lastBreak : max;
  return `${slice.slice(0, cut).trim()}…`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; messageId: string } },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Single query: message + its conversation, gated to the owner. If the
  // conversation isn't owned OR the message isn't in it, we 404 — never
  // leak which case failed.
  const message = await prisma.message.findFirst({
    where: {
      id: params.messageId,
      conversationId: params.id,
      authorType: "CHARACTER",
      conversation: {
        ownerId: user.id,
        archivedAt: null,
      },
    },
    select: {
      id: true,
      content: true,
      character: {
        select: {
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!message || !message.character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const displayName = message.character.displayName;
  const avatarUrl = isSafeAvatarUrl(message.character.avatarUrl)
    ? message.character.avatarUrl
    : null;
  const body = truncate(stripMarkdown(message.content), MAX_CONTENT_CHARS);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: COLORS.bg,
          padding: "56px 64px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderLeft: `4px solid ${COLORS.accent}`,
            borderRadius: 24,
            padding: "44px 52px",
          }}
        >
          {/* Header: avatar + name */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                width={72}
                height={72}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 9999,
                  objectFit: "cover",
                  border: `2px solid ${COLORS.accent}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 9999,
                  background: COLORS.accent,
                  color: COLORS.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  fontWeight: 700,
                }}
              >
                {initialsOf(displayName)}
              </div>
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  lineHeight: 1.1,
                }}
              >
                {displayName}
              </span>
              <span
                style={{
                  fontSize: 18,
                  color: COLORS.accentSoft,
                  marginTop: 4,
                }}
              >
                on lazyriver.co
              </span>
            </div>
          </div>

          {/* Body text — flex:1 so it fills remaining space and the
              footer sits on the baseline. */}
          <div
            style={{
              flex: 1,
              display: "flex",
              marginTop: 36,
              fontSize: 30,
              lineHeight: 1.35,
              color: COLORS.textPrimary,
              whiteSpace: "pre-wrap",
            }}
          >
            {body}
          </div>

          {/* Footer: wordmark */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 32,
              fontSize: 18,
              color: COLORS.textTertiary,
            }}
          >
            <span>lazyriver.co</span>
            <span>shared by a member</span>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      // Auth-gated response — never cache. `private` isn't enough, some
      // corporate / mobile-carrier proxies ignore Vary: Cookie and would
      // serve a cached member's PNG to the next session. `no-store`
      // matches the posture of the other auth'd routes in this repo.
      headers: {
        "Cache-Control": "no-store",
        Vary: "Cookie",
      },
    },
  );
}
