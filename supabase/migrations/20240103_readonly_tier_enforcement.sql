-- Tier-limit read-only enforcement.
--
-- When a user has more guides or bundles than their current plan allows,
-- the N most recently updated non-archived items remain editable; the rest
-- are read-only at the database layer regardless of what the client sends.
--
-- This migration:
--   1. Adds `updated_at` columns + triggers on guides and packs (bundles)
--      so we have a reliable "most recently touched" signal.
--   2. Defines SECURITY DEFINER helper functions that compute editability
--      for a given row by comparing its rank within the owner's set against
--      the owner's plan limit (read from user_billing -> plans -> plan_entitlements).
--   3. Adds RESTRICTIVE RLS policies on UPDATE and DELETE so the existing
--      ownership policies still apply (logical AND), but mutations are
--      additionally rejected when the row is read-only for its owner.
--
-- Family plan = unlimited limit = nothing is read-only. Missing/unknown
-- plan data fails OPEN (allows the edit) so a user is never bricked from
-- editing their own content by an entitlements outage.

-- ---------------------------------------------------------------------------
-- 1. updated_at columns + auto-bump trigger
-- ---------------------------------------------------------------------------

ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.packs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill: existing rows get updated_at = created_at (or now() if missing).
UPDATE public.guides
   SET updated_at = COALESCE(created_at, NOW())
 WHERE updated_at IS NULL;

UPDATE public.packs
   SET updated_at = COALESCE(created_at, NOW())
 WHERE updated_at IS NULL;

-- Going forward, every UPDATE bumps updated_at to NOW().
CREATE OR REPLACE FUNCTION public.bump_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guides_bump_updated_at ON public.guides;
CREATE TRIGGER guides_bump_updated_at
  BEFORE UPDATE ON public.guides
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_updated_at();

DROP TRIGGER IF EXISTS packs_bump_updated_at ON public.packs;
CREATE TRIGGER packs_bump_updated_at
  BEFORE UPDATE ON public.packs
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_updated_at();

-- Set a default for new rows so INSERT doesn't have to specify it.
ALTER TABLE public.guides ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.packs  ALTER COLUMN updated_at SET DEFAULT NOW();

-- Index to speed up the rank window function in the editability checks below.
CREATE INDEX IF NOT EXISTS guides_user_updated_idx
  ON public.guides (user_id, updated_at DESC)
  WHERE COALESCE(is_archived, false) = false;

CREATE INDEX IF NOT EXISTS packs_user_updated_idx
  ON public.packs (user_id, updated_at DESC)
  WHERE COALESCE(is_archived, false) = false;

-- ---------------------------------------------------------------------------
-- 2. Plan-limit lookup helper
-- ---------------------------------------------------------------------------
-- Returns NULL when the user is on an unlimited plan or no entitlement is
-- found (fail-open). Returns an integer limit otherwise.

CREATE OR REPLACE FUNCTION public.get_user_numeric_limit(
  p_user_id UUID,
  p_feature_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_key       TEXT;
  v_plan_name      TEXT;
  v_plan_id        UUID;
  v_value          INTEGER;
  v_is_unlimited   BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Default to 'free' when the user has no billing row (new user).
  SELECT COALESCE(plan_key, 'free')
    INTO v_plan_key
    FROM public.user_billing
   WHERE user_id = p_user_id
   LIMIT 1;

  IF v_plan_key IS NULL THEN
    v_plan_key := 'free';
  END IF;

  -- plan_key ('free') -> plans.name ('Free') via INITCAP.
  v_plan_name := INITCAP(v_plan_key);

  SELECT id INTO v_plan_id
    FROM public.plans
   WHERE name = v_plan_name
   LIMIT 1;

  IF v_plan_id IS NULL THEN
    -- Plan not found: fail open.
    RETURN NULL;
  END IF;

  SELECT feature_value_int, COALESCE(is_unlimited, false)
    INTO v_value, v_is_unlimited
    FROM public.plan_entitlements
   WHERE plan_id = v_plan_id
     AND feature_key = p_feature_key
   LIMIT 1;

  IF v_is_unlimited THEN
    RETURN NULL;
  END IF;

  RETURN v_value;  -- may be NULL → fail open
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Editability checks for guides and bundles
-- ---------------------------------------------------------------------------
-- Returns TRUE when the row is in the top-N most recently updated non-archived
-- rows for its owner, where N is the owner's plan limit. Returns TRUE on any
-- ambiguity (missing row, unknown plan, NULL limit) — fail open.

CREATE OR REPLACE FUNCTION public.is_guide_editable(p_guide_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_archived  BOOLEAN;
  v_limit     INTEGER;
  v_rank      INTEGER;
BEGIN
  IF p_guide_id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT user_id, COALESCE(is_archived, false)
    INTO v_user_id, v_archived
    FROM public.guides
   WHERE id = p_guide_id;

  IF v_user_id IS NULL THEN
    RETURN TRUE;  -- row doesn't exist; let other policies handle it
  END IF;

  -- Archived guides are not edited by users (the archive surface is being
  -- retired but the column lingers). Block edits while archived.
  IF v_archived THEN
    RETURN FALSE;
  END IF;

  v_limit := public.get_user_numeric_limit(v_user_id, 'active_guides_max');

  IF v_limit IS NULL THEN
    RETURN TRUE;  -- unlimited plan or unknown limit → fail open
  END IF;

  SELECT rnk INTO v_rank
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY updated_at DESC NULLS LAST, id DESC
             ) AS rnk
        FROM public.guides
       WHERE user_id = v_user_id
         AND COALESCE(is_archived, false) = false
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
  v_user_id   UUID;
  v_archived  BOOLEAN;
  v_limit     INTEGER;
  v_rank      INTEGER;
BEGIN
  IF p_pack_id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT user_id, COALESCE(is_archived, false)
    INTO v_user_id, v_archived
    FROM public.packs
   WHERE id = p_pack_id;

  IF v_user_id IS NULL THEN
    RETURN TRUE;
  END IF;

  IF v_archived THEN
    RETURN FALSE;
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
         AND COALESCE(is_archived, false) = false
    ) ranked
   WHERE id = p_pack_id;

  RETURN COALESCE(v_rank, 0) <= v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_guide_editable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pack_editable(UUID)  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RESTRICTIVE RLS policies — block UPDATE/DELETE on read-only rows
-- ---------------------------------------------------------------------------
-- These policies AND with whatever ownership policies already exist on
-- guides and packs. They do NOT replace those policies; they only add an
-- additional gate for read-only rows.

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guides_block_readonly_update ON public.guides;
CREATE POLICY guides_block_readonly_update
  ON public.guides
  AS RESTRICTIVE
  FOR UPDATE
  USING (public.is_guide_editable(id))
  WITH CHECK (public.is_guide_editable(id));

DROP POLICY IF EXISTS guides_block_readonly_delete ON public.guides;
CREATE POLICY guides_block_readonly_delete
  ON public.guides
  AS RESTRICTIVE
  FOR DELETE
  USING (public.is_guide_editable(id));

DROP POLICY IF EXISTS packs_block_readonly_update ON public.packs;
CREATE POLICY packs_block_readonly_update
  ON public.packs
  AS RESTRICTIVE
  FOR UPDATE
  USING (public.is_pack_editable(id))
  WITH CHECK (public.is_pack_editable(id));

DROP POLICY IF EXISTS packs_block_readonly_delete ON public.packs;
CREATE POLICY packs_block_readonly_delete
  ON public.packs
  AS RESTRICTIVE
  FOR DELETE
  USING (public.is_pack_editable(id));

-- pack_guides is the join table. Edits to a pack's guide list are
-- effectively edits to the pack — block them when the pack is read-only.
DROP POLICY IF EXISTS pack_guides_block_readonly_insert ON public.pack_guides;
CREATE POLICY pack_guides_block_readonly_insert
  ON public.pack_guides
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (public.is_pack_editable(pack_id));

DROP POLICY IF EXISTS pack_guides_block_readonly_delete ON public.pack_guides;
CREATE POLICY pack_guides_block_readonly_delete
  ON public.pack_guides
  AS RESTRICTIVE
  FOR DELETE
  USING (public.is_pack_editable(pack_id));
