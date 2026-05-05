-- export_user_data()
-- Called by the "Export Data" button in Account Settings.
-- Returns a single JSON object with all user-owned content.
-- SECURITY DEFINER so it can read all tables regardless of RLS
-- edge cases, but scopes every query to auth.uid() for safety.

CREATE OR REPLACE FUNCTION public.export_user_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN jsonb_build_object(
    'exported_at', now(),

    -- Profile
    'profile', (
      SELECT to_jsonb(p)
      FROM   profiles p
      WHERE  p.id = uid
    ),

    -- Guides (active + archived)
    'guides', COALESCE(
      (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at)
       FROM   guides g
       WHERE  g.user_id = uid),
      '[]'::jsonb
    ),

    -- Bundles / packs with embedded guide ID list
    'bundles', COALESCE(
      (SELECT jsonb_agg(
         to_jsonb(pk) || jsonb_build_object(
           'guide_ids', COALESCE(
             (SELECT jsonb_agg(pg.guide_id)
              FROM   pack_guides pg
              WHERE  pg.pack_id = pk.id),
             '[]'::jsonb
           )
         )
         ORDER BY pk.created_at
       )
       FROM packs pk
       WHERE pk.user_id = uid),
      '[]'::jsonb
    ),

    -- Favorited guide IDs
    'favorites', COALESCE(
      (SELECT jsonb_agg(uf.guide_id)
       FROM   user_favorites uf
       WHERE  uf.user_id = uid),
      '[]'::jsonb
    ),

    -- Shared links the user created
    'shared_links', COALESCE(
      (SELECT jsonb_agg(to_jsonb(sl))
       FROM   shared_links sl
       WHERE  sl.user_id = uid),
      '[]'::jsonb
    ),

    -- Usage metrics
    'usage_metrics', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'metric', uu.feature_key,
           'value',  uu.current_usage
         )
       )
       FROM user_usage uu
       WHERE uu.user_id = uid),
      '[]'::jsonb
    )
  );
END;
$$;

-- Allow signed-in users to invoke this function
GRANT EXECUTE ON FUNCTION public.export_user_data() TO authenticated;
