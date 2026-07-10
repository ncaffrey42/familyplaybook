/**
 * Build-time feature flags (Vite env, baked at build).
 *
 * FAMILY_SHARING_ENABLED gates the family/friends invite feature:
 * invite emails, invite acceptance, and member access to the owner's
 * content (SELECT for members, UPDATE for editors — enforced by RLS in
 * migration 20240110_family_member_access, surfaced in the client via
 * DataContext's shared-content fetch and the "Shared" badges).
 */
export const FAMILY_SHARING_ENABLED =
  import.meta.env.VITE_ENABLE_FAMILY_SHARING === 'true';
