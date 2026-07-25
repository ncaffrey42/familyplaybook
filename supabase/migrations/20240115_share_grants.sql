-- Per-person share grants: "Everyone sees only what you share."
--
-- Until now, every accepted family member saw EVERYTHING the owner has.
-- This migration moves VIEWERS to per-item grants — the owner picks which
-- guides/bundles each viewer can see in the Share Center. EDITORS keep
-- full access ("Everything — Kate is an editor", per the design brief).
--
-- Grandfathering: existing accepted viewers are seeded with a grant for
-- every current guide and bundle, so nobody loses access the moment this
-- ships. New viewers start with nothing granted.

-- ---------------------------------------------------------------------------
-- 1. Grants table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.share_grants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_id  UUID NOT NULL REFERENCES public.family_invitations(id) ON DELETE CASCADE,
  guide_id       UUID REFERENCES public.guides(id) ON DELETE CASCADE,
  bundle_id      UUID REFERENCES public.packs(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- exactly one target per grant
  CONSTRAINT share_grants_one_target CHECK (
    (guide_id IS NOT NULL AND bundle_id IS NULL) OR
    (guide_id IS NULL AND bundle_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS share_grants_guide_uniq
  ON public.share_grants (invitation_id, guide_id) WHERE guide_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS share_grants_bundle_uniq
  ON public.share_grants (invitation_id, bundle_id) WHERE bundle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS share_grants_invitation_idx
  ON public.share_grants (invitation_id);

ALTER TABLE public.share_grants ENABLE ROW LEVEL SECURITY;

-- Owner manages their own grants
DROP POLICY IF EXISTS share_grants_owner_all ON public.share_grants;
CREATE POLICY share_grants_owner_all
  ON public.share_grants
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Members can read the grants aimed at them (useful for client display)
DROP POLICY IF EXISTS share_grants_member_select ON public.share_grants;
CREATE POLICY share_grants_member_select
  ON public.share_grants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_invitations fi
       WHERE fi.id = share_grants.invitation_id
         AND fi.invited_user_id = auth.uid()
         AND fi.status = 'accepted'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Viewer-visibility helpers (SECURITY DEFINER: no RLS recursion)
-- ---------------------------------------------------------------------------
-- A guide is visible to the current viewer when granted directly OR when it
-- belongs to a granted bundle. A bundle is visible when granted.

CREATE OR REPLACE FUNCTION public.viewer_can_see_guide(p_guide_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM share_grants sg
      JOIN family_invitations fi ON fi.id = sg.invitation_id
     WHERE fi.invited_user_id = auth.uid()
       AND fi.status = 'accepted'
       AND (
         sg.guide_id = p_guide_id
         OR (sg.bundle_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM pack_guides pg
               WHERE pg.pack_id = sg.bundle_id AND pg.guide_id = p_guide_id))
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.viewer_can_see_bundle(p_bundle_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM share_grants sg
      JOIN family_invitations fi ON fi.id = sg.invitation_id
     WHERE fi.invited_user_id = auth.uid()
       AND fi.status = 'accepted'
       AND sg.bundle_id = p_bundle_id
  );
$$;

REVOKE ALL ON FUNCTION public.viewer_can_see_guide(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.viewer_can_see_bundle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.viewer_can_see_guide(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.viewer_can_see_bundle(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rewrite member SELECT policies: editors everything, viewers by grant
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS guides_member_select ON public.guides;
CREATE POLICY guides_member_select
  ON public.guides
  FOR SELECT
  TO authenticated
  USING (
    public.is_accepted_family_member(user_id, 'editor')
    OR public.viewer_can_see_guide(id)
  );

DROP POLICY IF EXISTS packs_member_select ON public.packs;
CREATE POLICY packs_member_select
  ON public.packs
  FOR SELECT
  TO authenticated
  USING (
    public.is_accepted_family_member(user_id, 'editor')
    OR public.viewer_can_see_bundle(id)
  );

DROP POLICY IF EXISTS pack_guides_member_select ON public.pack_guides;
CREATE POLICY pack_guides_member_select
  ON public.pack_guides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.packs p
             WHERE p.id = pack_guides.pack_id
               AND public.is_accepted_family_member(p.user_id, 'editor'))
    OR public.viewer_can_see_bundle(pack_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Grandfather existing accepted viewers: grant everything current
-- ---------------------------------------------------------------------------
INSERT INTO public.share_grants (owner_user_id, invitation_id, guide_id)
SELECT fi.owner_user_id, fi.id, g.id
  FROM public.family_invitations fi
  JOIN public.guides g ON g.user_id = fi.owner_user_id
 WHERE fi.status = 'accepted' AND fi.role = 'viewer'
ON CONFLICT DO NOTHING;

INSERT INTO public.share_grants (owner_user_id, invitation_id, bundle_id)
SELECT fi.owner_user_id, fi.id, p.id
  FROM public.family_invitations fi
  JOIN public.packs p ON p.user_id = fi.owner_user_id
 WHERE fi.status = 'accepted' AND fi.role = 'viewer'
ON CONFLICT DO NOTHING;
