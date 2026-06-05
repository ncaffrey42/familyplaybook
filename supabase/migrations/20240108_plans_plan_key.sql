-- Make plan_key the stable lookup key for plans, replacing the fragile
-- INITCAP(plan_key) → plans.name coupling.
--
-- Previously the plan_key on user_billing ('free') was mapped to plans.name
-- ('Free') via INITCAP in get_user_numeric_limit (and via a display-name lookup
-- in the JS). That coupling silently breaks if a plan's display name is ever
-- renamed or doesn't title-case cleanly — and because the limit functions fail
-- OPEN, a broken lookup would hand the user unlimited editing. plan_key is the
-- stable identifier (it matches user_billing.plan_key); name is presentation only.

-- ---------------------------------------------------------------------------
-- 1. Add + backfill plan_key on plans
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_key TEXT;

-- Backfill from the existing display name. The current plans are single-word
-- ('Free' / 'Couple' / 'Family'), so LOWER(TRIM(name)) reproduces the plan_key
-- that user_billing already stores. New plans should set plan_key explicitly
-- rather than rely on this transform.
UPDATE public.plans
   SET plan_key = LOWER(TRIM(name))
 WHERE plan_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS plans_plan_key_idx ON public.plans (plan_key);

-- ---------------------------------------------------------------------------
-- 2. Look up entitlements by plan_key instead of INITCAP(name)
-- ---------------------------------------------------------------------------
-- Same signature and fail-open behavior as the original in
-- 20240103_readonly_tier_enforcement.sql; only the plan lookup changes.

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

  -- Look up by the stable plan_key, not a name transform.
  SELECT id INTO v_plan_id
    FROM public.plans
   WHERE plan_key = v_plan_key
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
