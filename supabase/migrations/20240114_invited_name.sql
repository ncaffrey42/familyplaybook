-- Store the invitee's display name on family invitations.
--
-- Owners invite people they know by name ("Grandma Sue"), and until the
-- invite is accepted there is no profile to pull a name from — pending rows
-- could only show a bare email. invited_name is set at invite time and used
-- for pending display everywhere (Family & Friends, the Share Center avatar
-- row); once accepted, the member's own profile name takes precedence.

ALTER TABLE public.family_invitations
  ADD COLUMN IF NOT EXISTS invited_name TEXT;
