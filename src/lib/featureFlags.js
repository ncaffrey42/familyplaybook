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

/**
 * AI_GENERATION_ENABLED gates AI features (currently Voice-to-Guide).
 * Server-side enforcement lives in the voice-to-guide edge function:
 * paid plans get 20 generations/day via the ai_generation entitlement,
 * free users get a 3-generation lifetime taste.
 */
export const AI_GENERATION_ENABLED =
  import.meta.env.VITE_ENABLE_AI_GENERATION === 'true';

/**
 * HOST_MODE_ENABLED gates the Host Mode screen. Default OFF: Host Mode is
 * currently a non-functional mockup (the PIN is local-only React state, the
 * QR points at a route that doesn't exist, nothing is enforced server-side).
 * Hidden so app-store review doesn't flag a dead/placeholder feature. Flip on
 * only once Host Mode is actually implemented. The real "share with a guest"
 * paths today are share links and family sharing.
 */
export const HOST_MODE_ENABLED =
  import.meta.env.VITE_ENABLE_HOST_MODE === 'true';
