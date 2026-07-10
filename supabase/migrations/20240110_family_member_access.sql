-- Family member access: accepted members can actually see (and editors edit)
-- the owner's content.
--
-- Until now, accepting a family invitation granted nothing — no RLS policy
-- exposed the owner's guides/packs to members. These policies give:
--   viewer + editor : SELECT on the owner's guides, packs, pack_guides
--   editor          : UPDATE on the owner's guides and packs
--
-- Deliberately NOT granted:
--   - DELETE stays owner-only (guides_owner_delete / packs_owner_delete)
--   - INSERT stays owner-only — members create content in their own account
--   - The tier read-only RESTRICTIVE policies (guides_block_readonly_update,
--     packs_block_readonly_update) still AND with the editor UPDATE grant,
--     so over-limit items are read-only for editors exactly as for owners.

-- ---------------------------------------------------------------------------
-- 1. Membership helper
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so policy evaluation doesn't recurse through
-- family_invitations' own RLS.

CREATE OR REPLACE FUNCTION public.is_accepted_family_member(
  p_owner_id UUID,
  p_required_role TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM family_invitations
     WHERE owner_user_id   = p_owner_id
       AND invited_user_id = auth.uid()
       AND status          = 'accepted'
       AND (p_required_role IS NULL OR role = p_required_role)
  );
$$;

REVOKE ALL ON FUNCTION public.is_accepted_family_member(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_accepted_family_member(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Member SELECT
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS guides_member_select ON public.guides;
CREATE POLICY guides_member_select
  ON public.guides
  FOR SELECT
  TO authenticated
  USING (public.is_accepted_family_member(user_id));

DROP POLICY IF EXISTS packs_member_select ON public.packs;
CREATE POLICY packs_member_select
  ON public.packs
  FOR SELECT
  TO authenticated
  USING (public.is_accepted_family_member(user_id));

DROP POLICY IF EXISTS pack_guides_member_select ON public.pack_guides;
CREATE POLICY pack_guides_member_select
  ON public.pack_guides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.packs p
             WHERE p.id = pack_guides.pack_id
               AND public.is_accepted_family_member(p.user_id))
    OR EXISTS (SELECT 1 FROM public.guides g
                WHERE g.id = pack_guides.guide_id
                  AND public.is_accepted_family_member(g.user_id))
  );

-- ---------------------------------------------------------------------------
-- 3. Editor UPDATE
-- ---------------------------------------------------------------------------
-- WITH CHECK re-evaluates against the NEW row, so an editor cannot reassign
-- user_id to themselves (they are never an accepted member of their own
-- account) or to an owner they don't edit for.

DROP POLICY IF EXISTS guides_editor_update ON public.guides;
CREATE POLICY guides_editor_update
  ON public.guides
  FOR UPDATE
  TO authenticated
  USING (public.is_accepted_family_member(user_id, 'editor'))
  WITH CHECK (public.is_accepted_family_member(user_id, 'editor'));

DROP POLICY IF EXISTS packs_editor_update ON public.packs;
CREATE POLICY packs_editor_update
  ON public.packs
  FOR UPDATE
  TO authenticated
  USING (public.is_accepted_family_member(user_id, 'editor'))
  WITH CHECK (public.is_accepted_family_member(user_id, 'editor'));
