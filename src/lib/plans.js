/**
 * Canonical plan → feature mapping for Family Playbook.
 *
 * This is the single source of truth for:
 *   - What each plan is called (plan_key matches user_billing.plan_key)
 *   - What limits apply at each tier
 *   - What EntitlementService validates against (via plan_entitlements DB table)
 *
 * The values here are the display / documentation layer. The DB is the authority
 * for enforcement — these constants should stay in sync with the plan_entitlements
 * table in Supabase.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  plan_key   │ active_guides │ bundles │ editors │ storage │ AI  │
 * ├─────────────┼───────────────┼─────────┼─────────┼─────────┼─────┤
 * │  free       │       5       │    2    │    0    │  50 MB  │  ✗  │
 * │  couple     │      25       │   10    │    1    │ 500 MB  │  ✓  │
 * │  family     │   unlimited   │ unlimited│   10   │   5 GB  │  ✓  │
 * └─────────────┴───────────────┴─────────┴─────────┴─────────┴─────┘
 *
 * editor limit = number of additional users (beyond the account owner) that
 * can be invited to edit guides and bundles.
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
    limits: {
      active_guides: 5,
      bundles: 2,
      editors: 0,
      storage_bytes: 50 * 1024 * 1024,   // 50 MB
    },
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
    limits: {
      active_guides: 25,
      bundles: 10,
      editors: 1,
      storage_bytes: 500 * 1024 * 1024,  // 500 MB
    },
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
    limits: {
      active_guides: null,   // null = unlimited
      bundles: null,
      editors: 10,
      storage_bytes: 5 * 1024 * 1024 * 1024,  // 5 GB
    },
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
