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
//
// Resilience model:
//   - pg-listen's defaults give up reconnecting after 3000ms total
//     (`retryTimeout`). On Railway, brief network proxy blips can
//     easily exceed that — once we've given up, the subscriber sits
//     dead with no further reconnect attempts. We extend retryTimeout
//     to 60s so transient blips heal automatically.
//   - On a TERMINAL connection error (after pg-listen's reconnect loop
//     has exhausted), reset module state so the next `subscribe()` runs
//     init() against a fresh client. Without reset, the previous lazy
//     pattern silently dropped NOTIFYs because subscriber stayed
//     non-null and init was never re-entered.
//   - JSON parse errors on incoming payloads are caught by a custom
//     `parse` so a bad payload (e.g. a misfired manual NOTIFY) doesn't
//     trip pg-listen's error event. Our isNewMessagePayload guard
//     drops the null result downstream.
//   - SIGTERM clears state too, so a process that survives a graceful
//     shutdown signal (Railway grace period without follow-up SIGKILL)
//     still re-inits cleanly on the next subscribe rather than
//     registering handlers against a closed client.

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

// Give pg-listen a full minute to reconnect on transient network
// issues. Default is 3000ms which evaporates on any non-trivial blip.
const RETRY_TIMEOUT_MS = 60_000;

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

/**
 * pg-listen's default `parse` is plain JSON.parse, which throws on
 * non-JSON payloads and surfaces as an `error` event. We catch and
 * return null so the downstream isNewMessagePayload guard drops it
 * without disturbing the connection. Same shape as the default for
 * valid JSON; null for everything else.
 */
function safeParsePayload(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch {
    console.warn(
      "[mlchat/listen] dropping non-JSON payload",
      serialized.slice(0, 80),
    );
    return null;
  }
}

/**
 * Drop module-level subscriber state and close the underlying client.
 * Existing handlers stay registered — they'll be served by the next
 * init()'s subscriber once subscribe() re-enters. Idempotent.
 */
function resetSubscriberState(reason: string): void {
  if (!subscriber && !initPromise) return;
  console.warn(`[mlchat/listen] resetting state — ${reason}`);
  const dying = subscriber;
  subscriber = null;
  initPromise = null;
  if (dying) {
    dying.close().catch((e) => {
      console.error("[mlchat/listen] error during reset close", e);
    });
  }
}

async function init(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "[mlchat/listen] DATABASE_URL is not set — cannot open LISTEN connection",
    );
  }

  const sub = createSubscriber<Channels>(
    { connectionString },
    {
      // Re-issue SELECT 1 every 30s to detect half-open connections
      // behind Railway's network proxy.
      paranoidChecking: 30_000,
      // Give the reconnect loop 60s before giving up, vs the 3s default.
      retryTimeout: RETRY_TIMEOUT_MS,
      // Drop non-JSON payloads silently instead of firing error.
      parse: safeParsePayload,
    },
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
    // Connection-level terminal failure: pg-listen has exhausted its
    // reconnect window. Reset module state so the next subscribe() runs
    // init() against a fresh client. (Parse errors no longer reach this
    // path — they're swallowed by safeParsePayload above.)
    console.error("[mlchat/listen] subscriber error", err);
    if (subscriber === sub) {
      resetSubscriberState(`error event: ${err.message}`);
    }
  });

  sub.events.on("connected", () => {
    console.info("[mlchat/listen] connected");
  });

  sub.events.on("reconnect", (attempt) => {
    console.info(`[mlchat/listen] reconnect attempt ${attempt}`);
  });

  await sub.connect();
  await sub.listenTo(NOTIFY_CHANNEL);

  subscriber = sub;
}

/**
 * Internal: ensure a live subscriber exists. Inits if absent; awaits an
 * in-flight init promise if one's already running. Throws if init fails;
 * the caller decides retry semantics.
 */
async function ensureSubscriber(): Promise<void> {
  if (subscriber) return;
  if (!initPromise) {
    initPromise = init().catch((err) => {
      // Reset so the next call re-runs init instead of returning a
      // permanently-rejected promise.
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

/**
 * Register an SSE handler that fires whenever a new room message lands.
 * Returns an unsubscribe function — call it from the SSE route's cancel
 * / abort path so handlers don't leak across closed connections.
 */
export async function subscribe(handler: Handler): Promise<() => void> {
  await ensureSubscriber();
  handlers.add(handler);
  if (handlers.size > HANDLER_COUNT_WARN) {
    console.warn(`[mlchat/listen] handler count high: ${handlers.size}`);
  }
  return () => {
    handlers.delete(handler);
  };
}

// Graceful shutdown: Railway sends SIGTERM with ~10s grace before
// SIGKILL on every redeploy. Reset module state AND close the pg-listen
// client so the DB connection releases immediately. Reset (not just
// close) means a process that survives the grace window without dying
// re-inits cleanly on the next subscribe() rather than registering
// handlers against a closed client.
process.once("SIGTERM", () => {
  resetSubscriberState("SIGTERM");
});
process.once("SIGINT", () => {
  resetSubscriberState("SIGINT");
});
