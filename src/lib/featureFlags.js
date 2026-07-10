/**
 * Build-time feature flags (Vite env, baked at build).
 *
 * FAMILY_SHARING_ENABLED gates the family/friends invite feature. The
 * backend plumbing (send-family-invite, accept-family-invite, the
 * family_invitations table) works, but accepted members do not yet get
 * access to the owner's content — there are no member-aware RLS policies
 * and the client only fetches the signed-in user's own data. Until that
 * lands, the feature is hidden so testers don't invite people into a
 * membership that grants nothing.
 */
export const FAMILY_SHARING_ENABLED =
  import.meta.env.VITE_ENABLE_FAMILY_SHARING === 'true';
