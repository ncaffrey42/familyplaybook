/**
 * Presentation metadata for Family Playbook plans: plan_key, display name,
 * pricing shown in the UI, and feature flags used for marketing/comparison copy.
 *
 * This file is NOT the source of truth for numeric limits. Plan limits
 * (active_guides, bundles, editors, storage) live exclusively in the
 * plan_entitlements DB table and are read at runtime via EntitlementService
 * (which RLS also enforces). Keeping the numbers in one place — the DB — means
 * the client read-only set can't silently drift from what the server enforces.
 *
 * `plan_key` matches user_billing.plan_key and plans.plan_key; `displayName` is
 * presentation only and can be renamed freely without affecting entitlements.
 */

export const PLAN_KEYS = {
  FREE: 'free',
  COUPLE: 'couple',
  FAMILY: 'family',
};

// Ordered from lowest to highest tier (used for upgrade path logic)
export const PLAN_ORDER = [PLAN_KEYS.FREE, PLAN_KEYS.COUPLE, PLAN_KEYS.FAMILY];

export const PLANS = {
  [PLAN_KEYS.FREE]: {
    key: 'free',
    displayName: 'Free',
    price: { month: 0, year: 0 },
    features: {
      ai_generation: false,
      host_mode: false,
      templates_tier: 'starter',
      shared_links: 1,
    },
  },

  [PLAN_KEYS.COUPLE]: {
    key: 'couple',
    displayName: 'Couple',
    price: { month: 6.99, year: 69.90 },
    features: {
      ai_generation: true,
      host_mode: false,
      templates_tier: 'full',
      shared_links: null, // unlimited
    },
  },

  [PLAN_KEYS.FAMILY]: {
    key: 'family',
    displayName: 'Family',
    price: { month: 13.99, year: 139.90 },
    features: {
      ai_generation: true,
      host_mode: true,
      templates_tier: 'full',
      shared_links: null, // unlimited
    },
  },
};

/**
 * Returns the next tier above the given plan_key, or null if already at max.
 */
export function getUpgradePlan(planKey) {
  const idx = PLAN_ORDER.indexOf(planKey);
  if (idx === -1 || idx === PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[idx + 1];
}

/**
 * Returns the next tier below the given plan_key, or null if already at the
 * lowest tier (free).
 */
export function getDowngradePlan(planKey) {
  const idx = PLAN_ORDER.indexOf(planKey);
  if (idx <= 0) return null;
  return PLAN_ORDER[idx - 1];
}

/**
 * Returns true if planA is a higher tier than planB.
 */
export function isHigherTier(planA, planB) {
  return PLAN_ORDER.indexOf(planA) > PLAN_ORDER.indexOf(planB);
}

/**
 * Format a storage limit as a human-readable string (e.g. "500 MB", "5 GB").
 */
export function formatStorage(bytes) {
  if (bytes === null) return 'Unlimited';
  if (bytes >= 1024 * 1024 * 1024) return `${bytes / (1024 * 1024 * 1024)} GB`;
  if (bytes >= 1024 * 1024) return `${bytes / (1024 * 1024)} MB`;
  return `${bytes} B`;
}
