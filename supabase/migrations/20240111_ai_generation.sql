-- AI generation: enforceable entitlement + usage ledger.
--
-- Until now "AI features" gating existed only as marketing copy in
-- src/lib/plans.js — nothing in the database said who may use AI. This
-- migration adds:
--   1. an ai_generation entitlement row per plan (couple/family = enabled;
--      free = disabled, but the voice-to-guide function grants free users a
--      3-generation lifetime taste as an upsell hook)
--   2. an ai_generations ledger, written by edge functions (service role)
--      after each successful generation — the source of truth for the
--      paid daily cap (20/day) and the free lifetime cap (3), and usage
--      analytics for every future AI feature.

-- ---------------------------------------------------------------------------
-- 1. Entitlement rows
-- ---------------------------------------------------------------------------
INSERT INTO public.plan_entitlements (plan_id, feature_key, feature_value_int)
SELECT p.id, 'ai_generation',
       CASE WHEN p.plan_key IN ('couple', 'family') THEN 1 ELSE 0 END
  FROM public.plans p
 WHERE p.plan_key IN ('free', 'couple', 'family')
ON CONFLICT (plan_id, feature_key)
DO UPDATE SET feature_value_int = EXCLUDED.feature_value_int;

-- ---------------------------------------------------------------------------
-- 2. Usage ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_generations (
  id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL,             -- 'voice_guide', later: 'snap_guide', …
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_generations_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ai_generations_user_created_idx
  ON public.ai_generations (user_id, created_at DESC);

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

-- Users may see their own usage; only edge functions (service role, which
-- bypasses RLS) may write. No INSERT/UPDATE/DELETE policies on purpose.
DROP POLICY IF EXISTS ai_generations_owner_select ON public.ai_generations;
CREATE POLICY ai_generations_owner_select
  ON public.ai_generations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
