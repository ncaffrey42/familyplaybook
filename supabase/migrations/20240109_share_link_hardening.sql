-- Share-link hardening: stop anonymous enumeration of shared content.
--
-- Before this migration, RLS allowed:
--   shared_links: SELECT USING (true)            → anyone could list EVERY
--     share link id, defeating the "unguessable link" model entirely
--   guides:  SELECT ... OR is_shareable = true   → all shared guides were
--     enumerable via /rest/v1/guides
--   packs:   SELECT ... OR EXISTS(shared_links)  → same for bundles
--   pack_guides: SELECT via shared_links EXISTS  → same for join rows
--
-- After this migration, anonymous visitors can ONLY resolve shared content
-- through get_shared_content(p_share_id) — a SECURITY DEFINER RPC keyed by
-- the exact (unguessable) share link id. Knowing the link grants access to
-- that item alone; nothing is listable. Authenticated users keep owner-scoped
-- access to their own rows.

-- ---------------------------------------------------------------------------
-- 1. Share resolution RPC
-- ---------------------------------------------------------------------------
-- Mirrors what PublicSharePage used to assemble client-side:
--   guide link  → the guide (+ its bundle for header context)
--   bundle link → the bundle + its shareable guides (with their share ids)
-- Returns NULL for unknown links, {"type":"private"} for a guide the owner
-- has un-shared (the link exists but content is withheld).

CREATE OR REPLACE FUNCTION public.get_shared_content(p_share_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link          RECORD;
  v_guide         RECORD;
  v_bundle        RECORD;
  v_bundle_guides JSONB;
BEGIN
  IF p_share_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, guide_id, bundle_id INTO v_link
    FROM shared_links
   WHERE id = p_share_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_link.guide_id IS NOT NULL THEN
    SELECT id, name, description, icon, steps, category, is_shareable
      INTO v_guide
      FROM guides
     WHERE id = v_link.guide_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    -- The link survives un-sharing, but the content does not.
    IF NOT COALESCE(v_guide.is_shareable, FALSE) THEN
      RETURN jsonb_build_object('type', 'private');
    END IF;

    -- Bundle context for the header: the link's own bundle, else the first
    -- bundle this guide belongs to.
    SELECT p.id, p.name, p.description, p.color, p.image
      INTO v_bundle
      FROM packs p
     WHERE p.id = COALESCE(
             v_link.bundle_id,
             (SELECT pack_id FROM pack_guides WHERE guide_id = v_link.guide_id LIMIT 1)
           );

    RETURN jsonb_build_object(
      'type',   'guide',
      'guide',  jsonb_build_object(
                  'id', v_guide.id, 'name', v_guide.name,
                  'description', v_guide.description, 'icon', v_guide.icon,
                  'steps', v_guide.steps, 'category', v_guide.category
                ),
      'bundle', CASE WHEN v_bundle.id IS NULL THEN NULL ELSE
                  jsonb_build_object(
                    'id', v_bundle.id, 'name', v_bundle.name,
                    'description', v_bundle.description,
                    'color', v_bundle.color, 'image', v_bundle.image
                  )
                END
    );
  END IF;

  IF v_link.bundle_id IS NOT NULL THEN
    SELECT id, name, description, color, image INTO v_bundle
      FROM packs
     WHERE id = v_link.bundle_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    -- Only shareable guides that have their own share link are listed —
    -- same filter the client used to apply.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', g.id, 'name', g.name, 'description', g.description,
             'icon', g.icon, 'category', g.category, 'shareId', sl.id
           )), '[]'::jsonb)
      INTO v_bundle_guides
      FROM pack_guides pg
      JOIN guides g
        ON g.id = pg.guide_id
       AND COALESCE(g.is_shareable, FALSE)
      JOIN LATERAL (
        SELECT id FROM shared_links sl2 WHERE sl2.guide_id = g.id LIMIT 1
      ) sl ON TRUE
     WHERE pg.pack_id = v_link.bundle_id;

    RETURN jsonb_build_object(
      'type',          'bundle',
      'bundle',        jsonb_build_object(
                         'id', v_bundle.id, 'name', v_bundle.name,
                         'description', v_bundle.description,
                         'color', v_bundle.color, 'image', v_bundle.image
                       ),
      'bundle_guides', v_bundle_guides
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_content(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_content(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Owner-scoped SELECT policies (replace the world-readable ones)
-- ---------------------------------------------------------------------------
-- After these drops, anon has NO select policy on any of these tables — all
-- anonymous access flows through the RPC above.

DROP POLICY IF EXISTS "Allow public read access to shared links" ON public.shared_links;
DROP POLICY IF EXISTS shared_links_owner_select ON public.shared_links;
CREATE POLICY shared_links_owner_select
  ON public.shared_links
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Owners could create links but never revoke them; allow delete for future
-- unshare/revocation flows.
DROP POLICY IF EXISTS shared_links_owner_delete ON public.shared_links;
CREATE POLICY shared_links_owner_delete
  ON public.shared_links
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow public read access to shared guides and user's own guides" ON public.guides;
DROP POLICY IF EXISTS guides_owner_select ON public.guides;
CREATE POLICY guides_owner_select
  ON public.guides
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow public read access to shared packs and user's own packs" ON public.packs;
DROP POLICY IF EXISTS packs_owner_select ON public.packs;
CREATE POLICY packs_owner_select
  ON public.packs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow read access to pack_guides for shared/owned content" ON public.pack_guides;
DROP POLICY IF EXISTS pack_guides_owner_select ON public.pack_guides;
CREATE POLICY pack_guides_owner_select
  ON public.pack_guides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.packs p
             WHERE p.id = pack_guides.pack_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.guides g
                WHERE g.id = pack_guides.guide_id AND g.user_id = auth.uid())
  );
