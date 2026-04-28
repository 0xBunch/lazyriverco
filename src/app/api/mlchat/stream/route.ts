import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUTHOR_SELECT, toDTO } from "@/lib/chat";
import { DEFAULT_CHANNEL_ID } from "@/lib/channels";
import { subscribe } from "@/lib/mlchat/listen";

// SSE has to run in the Node runtime — Edge can't hold a long-lived
// ReadableStream and pg-listen needs the `pg` driver, which won't run
// on Edge anyway. maxDuration matches the conversation stream route.
export const runtime = "nodejs";
export const maxDuration = 60;

const PING_INTERVAL_MS = 25_000;

/**
 * GET /api/mlchat/stream
 *
 * Server-Sent Events feed for the room. Subscribes to the in-process
 * mlchat listener (fed by the Postgres `mlchat_message_notify`
 * trigger) and pushes each new room message down the wire as
 * `event: new_message` carrying a full ChatMessageDTO.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelId = DEFAULT_CHANNEL_ID;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  // Centralized teardown — invoked from req.signal abort, ReadableStream
  // cancel, and the safeEnqueue catch. Idempotent via the `closed` flag.
  function teardown() {
    if (closed) return;
    closed = true;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  // Register the abort listener IMMEDIATELY — before any `await` inside
  // the stream's start(). If the client disconnects during the subscribe
  // round-trip, this still fires and flips `closed` so the resumed
  // handler skips its work.
  const onAbort = () => teardown();
  req.signal.addEventListener("abort", onAbort);

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // Most common cause is a controller already closed by the
          // runtime. Tear down so subsequent fan-outs short-circuit.
          teardown();
        }
      }

      send("connected", { ts: new Date().toISOString() });

      try {
        unsubscribe = await subscribe(async (payload) => {
          if (closed) return;
          if (payload.channelId !== channelId) return;

          // Refetch the row + author relations. Trigger payload stays
          // compact; the cost is one extra round-trip per fan-out,
          // negligible at 7 humans + ~14 connections.
          const msg = await prisma.message.findUnique({
            where: { id: payload.messageId },
            include: {
              user: { select: AUTHOR_SELECT },
              character: { select: AUTHOR_SELECT },
            },
          });
          // Re-check after the await — the client may have disconnected
          // between NOTIFY arrival and the Prisma round-trip.
          if (closed) return;
          if (!msg) return;
          const dto = toDTO(msg);
          if (!dto) return;
          send("new_message", { message: dto });
        });
      } catch (e) {
        console.error("[mlchat/stream] subscribe failed", e);
        send("error", { message: "Failed to subscribe to room" });
        teardown();
        try {
          controller.close();
        } catch {
          // already closed
        }
        return;
      }

      // If the client aborted during the subscribe round-trip, the
      // listener registered above won't fire because teardown() already
      // unsubscribed. Nothing more to do — exit start().
      if (closed) {
        try {
          controller.close();
        } catch {
          // already closed
        }
        return;
      }

      pingTimer = setInterval(() => {
        if (closed) {
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = null;
          return;
        }
        send("ping", { ts: new Date().toISOString() });
      }, PING_INTERVAL_MS);
    },
    cancel() {
      teardown();
      req.signal.removeEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Defense-in-depth: tell nginx-style proxies not to buffer SSE.
      "X-Accel-Buffering": "no",
    },
  });
}
