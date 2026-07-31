-- Re-engagement, the handoff-manual way: expiring share links, guide
-- freshness confirmations, and per-user nudge dismissals.
--
-- 1. shared_links.expires_at — a link can close itself ("Tonight", "This
--    weekend") instead of living until manually revoked. NULL = until the
--    owner switches it off (today's behavior; existing links unchanged).
-- 2. get_shared_content refuses expired links with {"type":"expired"} so the
--    public page can show a warm "this link has ended" instead of an error.
-- 3. guides.last_confirmed_at — "Still accurate ✓" becomes a real signal the
--    freshness picker can use alongside updated_at.
-- 4. user_dismissals — shared store for "don't ask again" across the
--    freshness snooze and gap-filler "we're covered".

-- ---------------------------------------------------------------------------
-- 1. Expiring links
-- ---------------------------------------------------------------------------
ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. RPC: expired links end warmly
-- ---------------------------------------------------------------------------
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

  SELECT id, guide_id, bundle_id, expires_at INTO v_link
    FROM shared_links
   WHERE id = p_share_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A closed link is a feature, not an error.
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('type', 'expired');
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
    -- ordered by the bundle's curated position when present.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', g.id, 'name', g.name, 'description', g.description,
             'icon', g.icon, 'category', g.category, 'shareId', sl.id
           ) ORDER BY pg.position NULLS LAST, g.name), '[]'::jsonb)
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

-- ---------------------------------------------------------------------------
-- 3. Freshness confirmations
-- ---------------------------------------------------------------------------
ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 4. Nudge dismissals (freshness snoozes + gap "we're covered")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_dismissals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,   -- 'freshness_snooze' | 'gap_covered'
  key          TEXT NOT NULL,   -- guide id / gap topic key
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_dismissals_uniq UNIQUE (user_id, kind, key)
);

ALTER TABLE public.user_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_dismissals_owner_all ON public.user_dismissals;
CREATE POLICY user_dismissals_owner_all
  ON public.user_dismissals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
