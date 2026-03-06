-- Entitlement Service SQL Queries

-- 1. Fetch Plan & Entitlements
-- Get the active subscription, plan details, and all associated limits
SELECT 
    us.user_id,
    p.name as plan_name,
    pe.feature_key,
    pe.feature_value_int,
    pe.feature_value_text,
    pe.is_unlimited
FROM public.user_subscriptions us
JOIN public.plans p ON us.plan_id = p.id
JOIN public.plan_entitlements pe ON p.id = pe.plan_id
WHERE us.user_id = 'USER_UUID_HERE' 
  AND us.status = 'active';

-- 2. Count Active Guides (Runtime check if usage table is out of sync)
SELECT count(*) 
FROM public.guides 
WHERE user_id = 'USER_UUID_HERE' 
  AND (is_archived = false OR is_archived IS NULL);

-- 3. Count Bundles
SELECT count(*) 
FROM public.packs 
WHERE user_id = 'USER_UUID_HERE';

-- 4. Calculate Storage Used
-- Assuming a 'files' table or querying storage objects metadata
-- This is often complex in Supabase Storage without a tracking table.
-- We rely on 'user_usage' table for this reason.
SELECT current_usage 
FROM public.user_usage 
WHERE user_id = 'USER_UUID_HERE' AND feature_key = 'storage_bytes';

-- 5. Count Editors
-- Count users who have access to user's resources with 'editor' role
-- This depends on your sharing/collaboration schema (e.g., shared_links or team_members)
SELECT count(*)
FROM public.shared_links sl
WHERE sl.user_id = 'USER_UUID_HERE' 
-- AND sl.role = 'editor' -- if role column exists
;

-- 6. Fetch Usage Stats (The source of truth for the service)
SELECT feature_key, current_usage
FROM public.user_usage
WHERE user_id = 'USER_UUID_HERE';

-- 7. Update Usage (Example: Increment Active Guides)
INSERT INTO public.user_usage (user_id, feature_key, current_usage)
VALUES ('USER_UUID_HERE', 'active_guides', 1)
ON CONFLICT (user_id, feature_key)
DO UPDATE SET 
    current_usage = user_usage.current_usage + 1,
    updated_at = NOW();

-- 8. Reset/Recalculate Usage (Maintenance)
-- Example: Reset active_guides count based on actual table count
UPDATE public.user_usage
SET current_usage = (
    SELECT count(*) FROM public.guides 
    WHERE user_id = 'USER_UUID_HERE' 
      AND (is_archived = false OR is_archived IS NULL)
)
WHERE user_id = 'USER_UUID_HERE' AND feature_key = 'active_guides';