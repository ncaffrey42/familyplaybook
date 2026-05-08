-- Retire the archive feature.
--
-- Application-side, the archive UI is gone (Prompt 4 of the read-only tier
-- enforcement work). Going forward, no row will have `is_archived=true` set
-- by user action. Legacy archived rows still exist in the database — this
-- migration treats them as ordinary rows so they participate in the read-only
-- ranking like everything else.
--
-- The `is_archived` and `archived_at` columns on `guides` and `packs` are
-- intentionally **left in place** for now so any straggler reads keep
-- working. They will be dropped in a follow-up migration once we've
-- verified nothing references them in app code, edge functions, analytics
-- queries, or admin tools. To prepare for that drop, we also remove the
-- partial indexes that filter on `is_archived` (replaced with full indexes
-- below) and rewrite the editability check functions to ignore archive
-- state.

-- ---------------------------------------------------------------------------
-- 1. Replace partial indexes with full indexes
-- ---------------------------------------------------------------------------
-- Partial indexes on `WHERE is_archived = false` worked while archive was
-- semantically meaningful. With archive retired, every row participates
-- in the rank window, so we want regular full indexes that match the new
-- editability function queries.

DROP INDEX IF EXISTS public.guides_user_updated_idx;
DROP INDEX IF EXISTS public.packs_user_updated_idx;

CREATE INDEX IF NOT EXISTS guides_user_updated_idx
  ON public.guides (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS packs_user_updated_idx
  ON public.packs (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Rewrite editability functions to ignore archive state
-- ---------------------------------------------------------------------------
-- The previous version (20240103) returned FALSE for any archived row and
-- excluded archived rows from the rank window. With archive gone, both
-- behaviours are dropped — every row competes for the editable top-N slots
-- by `updated_at DESC`.

CREATE OR REPLACE FUNCTION public.is_guide_editable(p_guide_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_limit    INTEGER;
  v_rank     INTEGER;
BEGIN
  IF p_guide_id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT user_id INTO v_user_id
    FROM public.guides
   WHERE id = p_guide_id;

  IF v_user_id IS NULL THEN
    RETURN TRUE;
  END IF;

  v_limit := public.get_user_numeric_limit(v_user_id, 'active_guides_max');

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT rnk INTO v_rank
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY updated_at DESC NULLS LAST, id DESC
             ) AS rnk
        FROM public.guides
       WHERE user_id = v_user_id
    ) ranked
   WHERE id = p_guide_id;

  RETURN COALESCE(v_rank, 0) <= v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_pack_editable(p_pack_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_limit    INTEGER;
  v_rank     INTEGER;
BEGIN
  IF p_pack_id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT user_id INTO v_user_id
    FROM public.packs
   WHERE id = p_pack_id;

  IF v_user_id IS NULL THEN
    RETURN TRUE;
  END IF;

  v_limit := public.get_user_numeric_limit(v_user_id, 'bundles_max');

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT rnk INTO v_rank
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY updated_at DESC NULLS LAST, id DESC
             ) AS rnk
        FROM public.packs
       WHERE user_id = v_user_id
    ) ranked
   WHERE id = p_pack_id;

  RETURN COALESCE(v_rank, 0) <= v_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Follow-up: drop the columns (deferred)
-- ---------------------------------------------------------------------------
-- Once we have verified that no app code, edge function, analytics query,
-- or admin tool reads `is_archived` or `archived_at`, run a follow-up
-- migration with:
--
--   ALTER TABLE public.guides DROP COLUMN IF EXISTS is_archived;
--   ALTER TABLE public.guides DROP COLUMN IF EXISTS archived_at;
--   ALTER TABLE public.packs  DROP COLUMN IF EXISTS is_archived;
--   ALTER TABLE public.packs  DROP COLUMN IF EXISTS archived_at;
--
-- Leaving the columns in place for one release gives any straggler reads
-- (cached client bundles, error log dumps, etc.) a soft landing.
