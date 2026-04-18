-- chat_search_v1 — Postgres FTS for the new /chats management page.
--
-- Mirrors the gallery_v1 idiom (see 20260417150000_gallery_v1/migration.sql:55-80):
-- the built-in to_tsvector is STABLE because it looks up
-- default_text_search_config at call time, which blocks both stored-
-- generated columns AND expression indexes. Wrap with the config
-- hard-coded to promise IMMUTABLE behavior so the functional GIN index
-- below is buildable.
--
-- Scope decision (v1): title-only search. Message-body content is the
-- obvious next axis but adds either a materialized-view maintenance
-- problem or a per-Message GIN with correlated subqueries; defer until
-- title-only proves insufficient.

CREATE OR REPLACE FUNCTION conversation_search_tsv(title text)
    RETURNS tsvector
    LANGUAGE SQL
    IMMUTABLE
AS $$
    SELECT to_tsvector('english'::regconfig, coalesce(title, ''))
$$;

-- Functional GIN index — callers MUST invoke conversation_search_tsv()
-- with the same single-arg signature in WHERE so the planner uses this
-- index. See src/lib/chat-search.ts.
CREATE INDEX "Conversation_searchExpr_idx"
    ON "Conversation"
    USING GIN (conversation_search_tsv("title"));
