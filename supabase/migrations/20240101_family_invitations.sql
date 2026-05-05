-- Family invitations: allow owners to invite others by email
-- Invited users are linked once they accept via the /invite/accept flow

CREATE TABLE IF NOT EXISTS public.family_invitations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email    TEXT        NOT NULL,
  invited_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  role             TEXT        NOT NULL DEFAULT 'editor'
                              CHECK (role IN ('viewer', 'editor')),
  status           TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'declined', 'removed')),
  token            UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at      TIMESTAMPTZ,
  UNIQUE(owner_user_id, invited_email)
);

ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

-- Owners can read their own invitations
CREATE POLICY "owner_select" ON public.family_invitations
  FOR SELECT
  USING (auth.uid() = owner_user_id);

-- Accepted members can see the invitation that linked them
CREATE POLICY "member_select" ON public.family_invitations
  FOR SELECT
  USING (auth.uid() = invited_user_id);

-- Owners can remove members (soft-delete via edge function)
-- All writes go through edge functions using the service role key,
-- so no client-side INSERT/UPDATE/DELETE policies are needed.
