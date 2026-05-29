-- Allow owners to delete their own guides/bundles — even when read-only.
--
-- The read-only tier enforcement in 20240103 added RESTRICTIVE DELETE policies
-- that blocked deleting any over-limit (read-only) guide or bundle. That made
-- downgrade a trap: the items a user most wants to remove to get back under
-- their new plan's limit were exactly the ones they could not delete, leaving
-- them with no recovery path short of upgrading again.
--
-- We still block *editing* read-only rows (the UPDATE policies stay), but a
-- user must always be able to DELETE their own content. This migration:
--   1. Drops the RESTRICTIVE delete gates on guides, packs, and pack_guides.
--   2. Ensures a permissive owner-scoped DELETE policy exists so owners can
--      delete their own rows regardless of read-only status.

-- ---------------------------------------------------------------------------
-- 1. Drop the read-only delete gates
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS guides_block_readonly_delete      ON public.guides;
DROP POLICY IF EXISTS packs_block_readonly_delete       ON public.packs;
DROP POLICY IF EXISTS pack_guides_block_readonly_delete ON public.pack_guides;

-- ---------------------------------------------------------------------------
-- 2. Guarantee owners can delete their own rows
-- ---------------------------------------------------------------------------
-- These permissive policies OR with any existing ownership policies. They are
-- scoped to the authenticated owner, so they never widen access beyond a
-- user's own content.
DROP POLICY IF EXISTS guides_owner_delete ON public.guides;
CREATE POLICY guides_owner_delete
  ON public.guides
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS packs_owner_delete ON public.packs;
CREATE POLICY packs_owner_delete
  ON public.packs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- pack_guides rows belong to the owner of the parent pack. Allow the owner to
-- remove associations for their own packs (needed when deleting a bundle or a
-- guide cleans up its join rows).
DROP POLICY IF EXISTS pack_guides_owner_delete ON public.pack_guides;
CREATE POLICY pack_guides_owner_delete
  ON public.pack_guides
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.packs p
       WHERE p.id = pack_guides.pack_id
         AND p.user_id = auth.uid()
    )
  );
