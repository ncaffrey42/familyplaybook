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

/**
 * FEEDBACK_ENABLED gates the in-app feedback bubble + checkpoint prompts.
 * On unless explicitly disabled with VITE_ENABLE_FEEDBACK=false.
 */
export const FEEDBACK_ENABLED =
  import.meta.env.VITE_ENABLE_FEEDBACK !== 'false';

/**
 * SHARE_TAB_MANAGE_ENABLED gates the "Manage" entry point in the Share
 * tab's "Family & helpers" header, which opens the existing
 * ManageFamilyScreen (/account/family — also reachable from Settings).
 * The Share tab already lists members and manages what each can see; this
 * is the labelled door to inviting and removing them. Default OFF: new
 * user-visible surfaces ship dark (see docs/platform/NAV.md).
 * Always rendered inside the FAMILY_SHARING_ENABLED block, so it can
 * never appear when family sharing itself is off.
 */
export const SHARE_TAB_MANAGE_ENABLED =
  import.meta.env.VITE_ENABLE_SHARE_TAB_MANAGE === 'true';

/**
 * SHARE_LABELS_ENABLED gates the three additions from
 * docs/platform/SHARING.md: an arbitrary end-date for a link (host stays
 * don't fit "tonight"/"the weekend"), a recipient label ("Sitter — Friday"),
 * and the per-link open counter shown in the Share tab.
 *
 * Default OFF, and it MUST stay off until migration
 * 20240128_share_labels_access_log is applied — it reads and writes
 * shared_links.recipient_label / opened_count / last_opened_at and calls
 * the record_share_access RPC, none of which exist before then.
 */
export const SHARE_LABELS_ENABLED =
  import.meta.env.VITE_ENABLE_SHARE_LABELS === 'true';

/**
 * Re-engagement trio — each independently toggleable, all on unless
 * explicitly disabled. These are in-app-only surfaces (no push/email):
 * silence for a cold user is guaranteed by construction.
 */
export const SHARE_EXPIRY_ENABLED =
  import.meta.env.VITE_ENABLE_SHARE_EXPIRY !== 'false';
export const FRESHNESS_ENABLED =
  import.meta.env.VITE_ENABLE_FRESHNESS !== 'false';
export const GAP_NUDGE_ENABLED =
  import.meta.env.VITE_ENABLE_GAP_NUDGE !== 'false';
