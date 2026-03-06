-- Helper Queries for Entitlements System

-- 1. Get user's current plan and all entitlements
-- Returns the plan details and a JSON array of all entitlements associated with it
SELECT 
  p.name as plan_name,
  p.is_active,
  us.status as subscription_status,
  us.current_period_end,
  json_agg(
    json_build_object(
      'key', pe.feature_key,
      'value', COALESCE(pe.feature_value_int::text, pe.feature_value_text),
      'is_unlimited', pe.is_unlimited
    )
  ) as entitlements
FROM public.user_subscriptions us
JOIN public.plans p ON us.plan_id = p.id
LEFT JOIN public.plan_entitlements pe ON p.id = pe.plan_id
WHERE us.user_id = 'USER_ID_HERE'
GROUP BY p.id, us.id;


-- 2. Check if user has unlimited access to a specific entitlement (e.g., active_guides_max)
SELECT 
  pe.is_unlimited 
FROM public.user_subscriptions us
JOIN public.plan_entitlements pe ON us.plan_id = pe.plan_id
WHERE us.user_id = 'USER_ID_HERE' 
  AND pe.feature_key = 'active_guides_max';


-- 3. Get user's current usage counts (all keys)
SELECT 
  feature_key,
  current_usage
FROM public.user_usage
WHERE user_id = 'USER_ID_HERE';


-- 4. Query to manually assign Free plan to new users (Useful if Trigger didn't fire or for backfilling)
INSERT INTO public.user_subscriptions (user_id, plan_id, status)
SELECT 
  'USER_ID_HERE', 
  id, 
  'active'
FROM public.plans 
WHERE name = 'Free'
ON CONFLICT (user_id) DO NOTHING;