import "server-only";

import createSubscriber, { type Subscriber } from "pg-listen";
import type { NewMessagePayload } from "@/lib/mlchat/types";

// MLChat real-time fan-out, Postgres LISTEN/NOTIFY side. One pg-listen
// subscriber per Node process holds an open `LISTEN mlchat_new_message`
// connection (separate from Prisma's pool — pg-listen owns its own
// pg.Client; +1 long-lived DB connection per container is the cost). The
// Postgres trigger installed by the v01 migration emits NOTIFYs on
// Message INSERTs scoped to a Channel; we validate the payload shape and
// fan out to every SSE handler currently registered.

const NOTIFY_CHANNEL = "mlchat_new_message" as const;

type Channels = { [NOTIFY_CHANNEL]: NewMessagePayload };

type Handler = (payload: NewMessagePayload) => void | Promise<void>;

const handlers = new Set<Handler>();
let subscriber: Subscriber<Channels> | null = null;
let initPromise: Promise<void> | null = null;

// Soft alarm threshold. At 7 humans × ~2 devices we expect ~14 handlers.
// 100+ means either a runaway client or a leak — log so it's visible
// without blocking new subscribers.
const HANDLER_COUNT_WARN = 100;

function isNewMessagePayload(value: unknown): value is NewMessagePayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === "new_message" &&
    typeof v.messageId === "string" &&
    typeof v.channelId === "string" &&
    (v.authorType === "USER" || v.authorType === "CHARACTER") &&
    Array.isArray(v.mentionedAgentIds) &&
    v.mentionedAgentIds.every((id) => typeof id === "string") &&
    typeof v.createdAt === "string"
  );
}

async function init(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "[mlchat/listen] DATABASE_URL is not set — cannot open LISTEN connection",
    );
  }

  // paranoidChecking re-issues a SELECT 1 every 30s to detect half-open
  // connections behind proxies (Railway's networking layer can hold a
  // TCP socket open after the upstream pgbouncer drops it).
  const sub = createSubscriber<Channels>(
    { connectionString },
    { paranoidChecking: 30_000 },
  );

  sub.notifications.on(NOTIFY_CHANNEL, (payload) => {
    if (!isNewMessagePayload(payload)) {
      console.warn("[mlchat/listen] dropping malformed payload", payload);
      return;
    }
    // Snapshot handlers so a handler that unsubscribes mid-iteration
    // doesn't mutate the set we're walking.
    for (const handler of Array.from(handlers)) {
      try {
        const ret = handler(payload);
        if (ret && typeof ret.catch === "function") {
          ret.catch((e) =>
            console.error("[mlchat/listen] async handler failed", e),
          );
        }
      } catch (e) {
        console.error("[mlchat/listen] sync handler failed", e);
      }
    }
  });

  sub.events.on("error", (err) => {
    console.error("[mlchat/listen] subscriber error", err);
  });

  sub.events.on("connected", () => {
    console.info("[mlchat/listen] connected");
  });

  sub.events.on("reconnect", (attempt) => {
    console.info(`[mlchat/listen] reconnect attempt ${attempt}`);
  });

  await sub.connect();
  await sub.listenTo(NOTIFY_CHANNEL);

  // Graceful shutdown: Railway sends SIGTERM with ~10s grace before
  // SIGKILL on every redeploy. Closing the pg-listen client cleanly
  // releases the DB connection immediately rather than letting Postgres
  // time it out, which matters when push-to-main cycles can stack a
  // few half-dead connections against the pool.
  const shutdown = () => {
    sub.close().catch((e) => {
      console.error("[mlchat/listen] error during shutdown", e);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  subscriber = sub;
}

/**
 * Register an SSE handler that fires whenever a new room message lands.
 * Returns an unsubscribe function — call it from the SSE route's cancel
 * / abort path so handlers don't leak across closed connections.
 *
 * Lazily initializes the underlying pg-listen connection on first call.
 * If init throws (e.g. DB unreachable on cold boot), the rejection
 * propagates to the caller and the handler is NOT registered. Subsequent
 * subscribe() calls retry init once the previous attempt settles.
 */
export async function subscribe(handler: Handler): Promise<() => void> {
  if (!subscriber) {
    if (!initPromise) {
      initPromise = init().catch((err) => {
        // Reset so the next subscribe() retries instead of returning a
        // permanently-rejected promise.
        initPromise = null;
        throw err;
      });
    }
    await initPromise;
  }
  handlers.add(handler);
  if (handlers.size > HANDLER_COUNT_WARN) {
    console.warn(`[mlchat/listen] handler count high: ${handlers.size}`);
  }
  return () => {
    handlers.delete(handler);
  };
}
