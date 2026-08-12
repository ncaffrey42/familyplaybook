-- "Ask the Playbook" / Alfred — grounded Q&A over one share link's guides.
--
-- Design + resolved decisions: docs/platform/ASK_PLAYBOOK.md
-- Security posture inherited from docs/platform/RBAC.md §1.2:
--   the schema has ZERO `TO anon` RLS policies, and this migration adds none.
--   Anonymous guests reach embeddings ONLY through SECURITY DEFINER functions
--   that resolve scope from a share id they cannot forge into something wider.
--
-- A retrieval system is an enumeration primitive if the scope is wrong, so the
-- scope rules here are deliberately a copy of get_shared_content's: link must
-- exist, must not be expired, target must still be shareable.

-- pgvector. Supabase conventionally installs extensions into the `extensions`
-- schema rather than `public`, so:
--   * IF NOT EXISTS is a no-op when it is already installed (in EITHER schema),
--   * and every function below that touches the `vector` type or the `<=>`
--     operator sets `search_path TO 'public', 'extensions'` rather than this
--     codebase's usual 'public' alone.
-- Without that second schema entry the type and operator fail to resolve at
-- runtime whenever the extension did not land in public.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Make the type/operator resolvable for the DDL in this migration too,
-- independent of the session default the migration runner happens to use.
-- Plain SET, not SET LOCAL: outside a transaction block SET LOCAL emits a
-- warning and silently does nothing, which would leave the DDL below unable
-- to resolve `vector` depending on how the migration is applied.
SET search_path TO public, extensions;

-- ---------------------------------------------------------------------------
-- 1. guide_embeddings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guide_embeddings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id     uuid NOT NULL REFERENCES public.guides(id)   ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  chunk_index  integer NOT NULL,
  content      text    NOT NULL,
  content_hash text    NOT NULL,
  embedding    vector(1536) NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Re-embedding a guide must REPLACE its chunks, never accumulate duplicates
  -- (the original spec's schema allowed silent duplication on every edit).
  CONSTRAINT guide_embeddings_guide_chunk_uniq UNIQUE (guide_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS guide_embeddings_guide_idx
  ON public.guide_embeddings (guide_id);

-- HNSW over cosine distance. Built after the table so it exists even when the
-- table starts empty; pgvector handles an empty HNSW index fine.
CREATE INDEX IF NOT EXISTS guide_embeddings_vec_idx
  ON public.guide_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.guide_embeddings ENABLE ROW LEVEL SECURITY;

-- Owner read only. No INSERT/UPDATE/DELETE policy for `authenticated` at all:
-- every write goes through the service role (embed-guides), so a client cannot
-- poison another owner's index. No `anon` policy — see the header.
DROP POLICY IF EXISTS guide_embeddings_owner_select ON public.guide_embeddings;
CREATE POLICY guide_embeddings_owner_select
  ON public.guide_embeddings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. ask_playbook_usage — bucketed counters, never question text
-- ---------------------------------------------------------------------------
-- Decision #4 (ASK_PLAYBOOK.md §3): counts only. A babysitter's questions are
-- health data about a child; they are never persisted. Hour buckets keep this
-- table bounded and make the rate check a single-row lookup.
CREATE TABLE IF NOT EXISTS public.ask_playbook_usage (
  share_id       uuid        NOT NULL REFERENCES public.shared_links(id) ON DELETE CASCADE,
  hour_bucket    timestamptz NOT NULL,
  question_count integer     NOT NULL DEFAULT 0,
  refusal_count  integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (share_id, hour_bucket)
);

ALTER TABLE public.ask_playbook_usage ENABLE ROW LEVEL SECURITY;

-- The owner of the link may read its counts. Writes are SECURITY DEFINER only.
DROP POLICY IF EXISTS ask_usage_owner_select ON public.ask_playbook_usage;
CREATE POLICY ask_usage_owner_select
  ON public.ask_playbook_usage
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shared_links sl
     WHERE sl.id = ask_playbook_usage.share_id
       AND sl.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- 3. resolve_ask_scope — the security crux
-- ---------------------------------------------------------------------------
-- Takes ONLY a share id. Never accepts a guide list from the caller.
-- Mirrors get_shared_content's checks exactly, so Ask can never answer from
-- something the share page itself would refuse to render:
--   * link exists
--   * not expired          (an expired link must answer NOTHING — otherwise
--                           this feature silently defeats link expiry)
--   * target still shareable
--
-- Also enforces the paid-owner gate (decision #2) and the single-workspace
-- invariant (§2 rule 5). The workspace check uses
-- COALESCE(workspace_id, user_id) so it is correct BEFORE and AFTER
-- ARCHITECTURE.md migration #4 backfills workspace_id — today every guide's
-- key is its owner, which the single-owner bijection makes equivalent.
CREATE OR REPLACE FUNCTION public.resolve_ask_scope(p_share_id uuid)
RETURNS TABLE (
  allowed       boolean,
  reason        text,
  owner_id      uuid,
  workspace_key uuid,
  is_paid       boolean,
  guide_ids     uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link      RECORD;
  v_guides    uuid[];
  v_keys      uuid[];
  v_owner     uuid;
  v_plan      text;
  v_is_paid   boolean;
BEGIN
  allowed := false; reason := 'not_found';
  owner_id := NULL; workspace_key := NULL; is_paid := false; guide_ids := '{}';

  IF p_share_id IS NULL THEN
    RETURN NEXT; RETURN;
  END IF;

  SELECT id, user_id, guide_id, bundle_id, expires_at
    INTO v_link
    FROM shared_links
   WHERE id = p_share_id;
  IF NOT FOUND THEN
    RETURN NEXT; RETURN;
  END IF;

  v_owner := v_link.user_id;

  -- Expiry: same rule and same wording as get_shared_content.
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    reason := 'expired';
    RETURN NEXT; RETURN;
  END IF;

  -- Paid-owner gate (decision #2). Mirrors is_premium()'s notion of paid.
  SELECT plan_key INTO v_plan
    FROM user_billing WHERE user_id = v_owner LIMIT 1;
  v_is_paid := COALESCE(v_plan, 'free') <> 'free';
  is_paid := v_is_paid;
  IF NOT v_is_paid THEN
    reason := 'not_eligible';
    RETURN NEXT; RETURN;
  END IF;

  -- Scope: exactly what the share page itself would show.
  IF v_link.guide_id IS NOT NULL THEN
    SELECT ARRAY(
      SELECT g.id FROM guides g
       WHERE g.id = v_link.guide_id
         AND COALESCE(g.is_shareable, false)
    ) INTO v_guides;
  ELSIF v_link.bundle_id IS NOT NULL THEN
    SELECT ARRAY(
      SELECT g.id
        FROM pack_guides pg
        JOIN guides g ON g.id = pg.guide_id
       WHERE pg.pack_id = v_link.bundle_id
         AND COALESCE(g.is_shareable, false)
    ) INTO v_guides;
  ELSE
    reason := 'empty'; RETURN NEXT; RETURN;
  END IF;

  IF v_guides IS NULL OR array_length(v_guides, 1) IS NULL THEN
    reason := 'empty';
    RETURN NEXT; RETURN;
  END IF;

  -- Single-workspace invariant. Refuse rather than silently narrow.
  SELECT ARRAY(
    SELECT DISTINCT COALESCE(g.workspace_id, g.user_id)
      FROM guides g WHERE g.id = ANY(v_guides)
  ) INTO v_keys;

  -- IS DISTINCT FROM, not <>: array_length returns NULL for an empty array,
  -- and `NULL <> 1` is NULL, which an IF treats as false — i.e. a plain <>
  -- would fall THROUGH to "allowed" on the degenerate case. Fail closed.
  IF v_keys IS NULL OR array_length(v_keys, 1) IS DISTINCT FROM 1 THEN
    reason := 'cross_workspace';
    RETURN NEXT; RETURN;
  END IF;

  allowed := true; reason := 'ok';
  owner_id := v_owner; workspace_key := v_keys[1]; guide_ids := v_guides;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_ask_scope(uuid) FROM PUBLIC;
-- service_role only: the edge function calls this. Guests never call it
-- directly, so it cannot be used to probe which links are paid/expired.
GRANT EXECUTE ON FUNCTION public.resolve_ask_scope(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. match_playbook_chunks — vector search, scope-locked
-- ---------------------------------------------------------------------------
-- Re-resolves scope from the share id ITSELF rather than trusting a guide list
-- passed in. Even a compromised edge function cannot widen retrieval past what
-- the share exposes.
CREATE OR REPLACE FUNCTION public.match_playbook_chunks(
  p_share_id    uuid,
  p_embedding   vector(1536),
  p_match_count integer DEFAULT 5
)
RETURNS TABLE (
  guide_id   uuid,
  guide_name text,
  content    text,
  distance   double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
-- 'extensions' included so the `vector` type and the `<=>` operator resolve
-- wherever pgvector was installed. Every other function here uses the
-- codebase's usual bare 'public'.
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_scope RECORD;
BEGIN
  SELECT * INTO v_scope FROM public.resolve_ask_scope(p_share_id);
  IF NOT COALESCE(v_scope.allowed, false) THEN
    RETURN;                       -- no rows: not eligible, expired, or unknown
  END IF;

  RETURN QUERY
  SELECT e.guide_id,
         g.name,
         e.content,
         (e.embedding <=> p_embedding)::double precision AS distance
    FROM guide_embeddings e
    JOIN guides g ON g.id = e.guide_id
   WHERE e.guide_id = ANY(v_scope.guide_ids)
   ORDER BY e.embedding <=> p_embedding
   LIMIT GREATEST(1, LEAST(COALESCE(p_match_count, 5), 20));
END;
$$;

REVOKE ALL ON FUNCTION public.match_playbook_chunks(uuid, vector, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_playbook_chunks(uuid, vector, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. bump_ask_usage — rate limit + counts-only analytics in one call
-- ---------------------------------------------------------------------------
-- Returns the count for the current hour AFTER incrementing, so the caller can
-- enforce the cap without a separate read (and without a race between the two).
-- p_refused feeds the refusal counter Prompt 18's digest needs, still without
-- storing a single question.
CREATE OR REPLACE FUNCTION public.bump_ask_usage(
  p_share_id uuid,
  p_refused  boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bucket timestamptz := date_trunc('hour', now());
  v_count  integer;
BEGIN
  INSERT INTO ask_playbook_usage (share_id, hour_bucket, question_count, refusal_count)
  VALUES (p_share_id, v_bucket, 1, CASE WHEN p_refused THEN 1 ELSE 0 END)
  ON CONFLICT (share_id, hour_bucket) DO UPDATE
    SET question_count = ask_playbook_usage.question_count + 1,
        refusal_count  = ask_playbook_usage.refusal_count
                         + CASE WHEN p_refused THEN 1 ELSE 0 END
  RETURNING question_count INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_ask_usage(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_ask_usage(uuid, boolean) TO service_role;

-- Refusal-only counter.
--
-- A question is counted ONCE, by bump_ask_usage, at the top of the request —
-- before any spend, so the rate limit is enforced on attempts. Whether it then
-- ends in a refusal is only known later, and marking it must NOT re-increment
-- question_count: doing so would make every refusal consume two of the 20
-- hourly slots and double-count itself in the analytics.
CREATE OR REPLACE FUNCTION public.mark_ask_refusal(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE ask_playbook_usage
     SET refusal_count = refusal_count + 1
   WHERE share_id = p_share_id
     AND hour_bucket = date_trunc('hour', now());
END;
$$;

REVOKE ALL ON FUNCTION public.mark_ask_refusal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_ask_refusal(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. ask_eligibility — the ONE thing a guest may ask about a link
-- ---------------------------------------------------------------------------
-- The client needs to know whether to render the Ask affordance at all
-- (decision #2: a free owner's guest sees nothing, not a disabled control).
-- This returns a single boolean and NOTHING else — not the reason, not the
-- owner, not the guide set — so it cannot be used to probe link state.
-- Callable by anon precisely because it leaks only "is Ask available here",
-- which the presence of the UI would reveal anyway.
CREATE OR REPLACE FUNCTION public.ask_playbook_available(p_share_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_scope RECORD;
BEGIN
  IF p_share_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_scope FROM public.resolve_ask_scope(p_share_id);
  RETURN COALESCE(v_scope.allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.ask_playbook_available(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ask_playbook_available(uuid) TO anon, authenticated;
