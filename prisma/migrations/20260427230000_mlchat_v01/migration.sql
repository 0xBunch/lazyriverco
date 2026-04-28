-- MLChat v0.1 — foundation. PR 1 of 2.
--
-- Resurrects the existing Channel/AgentChannel/Message group-chat shape
-- and adds the columns + Postgres trigger that PR 2 (agents speak) hangs
-- off. All changes are additive — no drops, no renames, no destructive
-- ALTERs. Column defaults use non-volatile expressions so PG ≥11 takes
-- the metadata-only fast path (no table rewrite, no AccessExclusiveLock
-- on a populated Message table). Same pattern landed safely 3 days ago
-- in 20260424120000_feeds_foundation (User.betaFeatures).
--
-- Trigger fires NOTIFY on Message INSERTs scoped to a Channel. The
-- Conversation 1:1 path (channelId NULL, conversationId set) is filtered
-- by the trigger's WHEN clause so it pays zero plpgsql overhead.
--
-- Statements use IF NOT EXISTS / DO $$ EXCEPTION guards so the migration
-- is replay-safe — if it half-applies on a network blip mid-DDL, a
-- re-run completes the unfinished work instead of erroring on already-
-- existing objects.

BEGIN;

-- ---------------------------------------------------------------------------
-- Additive: Message.triggeredByMessageId
--
-- Self-referential nullable FK. Set on agent-reply rows in PR 2 to point
-- at the USER message that summoned the reply. ON DELETE SET NULL —
-- deleting the trigger message keeps the reply as historical record.
-- ---------------------------------------------------------------------------

ALTER TABLE "Message"
    ADD COLUMN IF NOT EXISTS "triggeredByMessageId" TEXT;

DO $$ BEGIN
    ALTER TABLE "Message"
        ADD CONSTRAINT "Message_triggeredByMessageId_fkey"
        FOREIGN KEY ("triggeredByMessageId") REFERENCES "Message"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Message_triggeredByMessageId_idx"
    ON "Message"("triggeredByMessageId");

-- ---------------------------------------------------------------------------
-- Additive: Message.mentionedAgentIds
--
-- Denormalized array of Character.id values that the message text
-- @-mentioned. Populated server-side at INSERT time by the messages
-- POST handler (PR 2 — PR 1 always writes []) and consumed by the
-- listener's downstream agent-reply orchestrator (PR 2) to fan out
-- replies. Defaults to empty array so existing rows + non-mention
-- messages return [] without a NULL check.
--
-- ARRAY[]::TEXT[] is IMMUTABLE in PG ≥11, so this ADD COLUMN takes the
-- metadata-only fast path: no table rewrite, no exclusive lock duration
-- proportional to row count. Verified by the User.betaFeatures
-- precedent in 20260424120000_feeds_foundation:193-194 which used the
-- identical pattern on a populated User table without incident.
-- ---------------------------------------------------------------------------

ALTER TABLE "Message"
    ADD COLUMN IF NOT EXISTS "mentionedAgentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ---------------------------------------------------------------------------
-- Postgres trigger: mlchat_message_notify
--
-- AFTER INSERT on Message, when channelId IS NOT NULL, emits a NOTIFY
-- on `mlchat_new_message` with a compact JSON payload. The Node-side
-- pg-listen subscriber (src/lib/mlchat/listen.ts) fans this out to
-- every open SSE connection in the room.
--
-- The IS NULL filter lives in the trigger's WHEN clause (not the
-- function body) so conversation-scoped INSERTs (the existing 1:1
-- chat hot path, two rows per turn) pay zero plpgsql overhead — the
-- DB skips trigger invocation entirely. This also enforces the
-- architectural boundary "this trigger does not touch conversations"
-- at the DB level instead of relying on an `if` inside the function.
--
-- Payload denormalizes `authorType` and `mentionedAgentIds` so PR 2's
-- orchestrator can early-skip CHARACTER messages (bot-to-bot loop
-- prevention) without a Prisma round-trip. The SSE fan-out path
-- consumes only `messageId` + `channelId` and refetches; the extra
-- fields cost nothing at v0.1 read volume.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mlchat_message_notify() RETURNS trigger AS $$
DECLARE
    payload JSONB;
BEGIN
    payload := jsonb_build_object(
        'kind',              'new_message',
        'messageId',         NEW."id",
        'channelId',         NEW."channelId",
        'authorType',        NEW."authorType",
        'mentionedAgentIds', NEW."mentionedAgentIds",
        'createdAt',         to_char(NEW."createdAt" AT TIME ZONE 'UTC',
                                     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    PERFORM pg_notify('mlchat_new_message', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mlchat_message_notify_trigger ON "Message";
CREATE TRIGGER mlchat_message_notify_trigger
    AFTER INSERT ON "Message"
    FOR EACH ROW
    WHEN (NEW."channelId" IS NOT NULL)
    EXECUTE FUNCTION mlchat_message_notify();

COMMIT;
