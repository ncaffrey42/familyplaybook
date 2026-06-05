import { supabase } from '@/lib/supabaseClient';

/**
 * Service to handle user entitlement checks based on subscription plans.
 *
 * The plan_entitlements DB table is the single source of truth for numeric
 * limits — this service never reads limit numbers from src/lib/plans.js (which
 * is presentation-only). Plans are looked up by the stable plan_key, never by
 * display name.
 */
export class EntitlementService {
  /**
   * @param {object} [options]
   * @param {(userId: string) => Promise<object|null>} [options.dataFetcher] -
   *   Optional override for data fetching. When provided, Supabase is never
   *   called — useful for offline unit testing via dependency injection.
   */
  constructor({ dataFetcher } = {}) {
    // Cache structure: Map<userId, { data: UserEntitlements, timestamp: number }>
    this.cache = new Map();
    // Cache of limits per plan_key (for any plan, not just the current user's).
    this._planLimitsCache = new Map();
    this.TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    this._dataFetcher = dataFetcher || null;

    // Action definitions mapped to database feature keys
    this.ACTIONS = {
      GUIDE_CREATE: 'active_guides',
      GUIDE_ARCHIVE: 'archive_ops', // Special case, usually always allowed
      GUIDE_UNARCHIVE: 'active_guides', // Unarchiving adds to active count
      BUNDLE_CREATE: 'bundles',
      FILE_UPLOAD: 'storage_bytes',
      EDITOR_INVITE: 'editors',
      EDITOR_ROLE_CHANGE: 'editors',
      TEMPLATE_USE: 'templates_tier'
    };
  }

  /**
   * Main entry point to check if a user can perform an action.
   * @param {string} userId - UUID of the user
   * @param {string} action - Action key from this.ACTIONS keys
   * @param {object} payload - Additional data (e.g., file size, target role, template tier)
   * @returns {Promise<{allowed: boolean, reason_code: string|null, limit: number|null, current: number|null, upgrade_suggestion: string|null}>}
   */
  async canPerform(userId, action, payload = {}) {
    if (!userId) return this._deny('NO_USER');

    try {
      // 1. Get Plan & Usage Data (with caching)
      const data = await this._getUserData(userId);
      if (!data) return this._deny('DATA_FETCH_ERROR');

      const { plan, entitlements, usage } = data;

      // 2. Route to specific logic handlers
      let result;
      switch (action) {
        case 'GUIDE_CREATE':
          result = this._checkNumericLimit(entitlements, usage, 'active_guides', 1);
          break;
        case 'GUIDE_ARCHIVE':
          result = this._allow(); // Always allowed to archive
          break;
        case 'GUIDE_UNARCHIVE':
          // payload.count lets bulk restore check the full increment at once
          result = this._checkNumericLimit(entitlements, usage, 'active_guides', payload.count ?? 1);
          break;
        case 'BUNDLE_CREATE':
          result = this._checkNumericLimit(entitlements, usage, 'bundles', 1);
          break;
        case 'FILE_UPLOAD':
          const fileSize = payload.file_size_bytes || 0;
          result = this._checkNumericLimit(entitlements, usage, 'storage_bytes', fileSize);
          break;
        case 'EDITOR_INVITE':
          // Start check
          result = this._checkNumericLimit(entitlements, usage, 'editors', 1);
          break;
        case 'EDITOR_ROLE_CHANGE':
           // Only relevant if changing TO editor
           if (payload.new_role === 'editor') {
              result = this._checkNumericLimit(entitlements, usage, 'editors', 1);
           } else {
              result = this._allow();
           }
           break;
        case 'TEMPLATE_USE':
           result = this._checkTier(entitlements, payload.template_tier);
           break;
        default:
          console.warn(`Unknown entitlement action: ${action}`);
          result = this._deny('UNKNOWN_ACTION');
      }

      // 3. Add upgrade suggestion if denied. Prefer the stable plan_key; fall
      //    back to name for injected test fixtures that only set `name`.
      if (!result.allowed) {
        result.upgrade_suggestion = this._getUpgradeSuggestion(plan.key ?? plan.name, result.reason_code);
      }

      // 4. Logging
      this._logCheck(userId, action, result);

      return result;

    } catch (error) {
      console.error('Entitlement check failed:', error);
      return this._deny('SYSTEM_ERROR');
    }
  }

  // --- Internal Helpers ---

  /**
   * Returns cached data if fresh, otherwise fetches via injected dataFetcher or Supabase.
   */
  async _getUserData(userId) {
    const now = Date.now();
    const cached = this.cache.get(userId);

    if (cached && (now - cached.timestamp < this.TTL)) {
      return cached.data;
    }

    const data = this._dataFetcher
      ? await this._dataFetcher(userId)
      : await this._fetchFromSupabase(userId);

    if (data) {
      this.cache.set(userId, { data, timestamp: now });
    }
    return data;
  }

  /**
   * Fetches plan, entitlements, and usage from Supabase.
   */
  async _fetchFromSupabase(userId) {
    const { data: billing, error: billingError } = await supabase
      .from('user_billing')
      .select('plan_key, subscription_status')
      .eq('user_id', userId)
      .maybeSingle();

    if (billingError) {
      console.error('Error fetching billing:', billingError);
      return null;
    }

    // Default to free plan if no billing record exists (new user)
    const planKey = billing?.plan_key || 'free';

    // Look up the plan by the stable plan_key — NOT by display name, which is
    // presentation-only and can be renamed without affecting entitlements.
    const { data: planRecord } = await supabase
      .from('plans')
      .select('id, name')
      .eq('plan_key', planKey)
      .single();

    const planId = planRecord?.id;

    if (!planId) return null; // Critical failure — plan not found in DB

    // Parallel fetch entitlements and usage
    const [entitlementsRes, usageRes] = await Promise.all([
      supabase.from('plan_entitlements').select('*').eq('plan_id', planId),
      supabase.from('user_usage').select('*').eq('user_id', userId)
    ]);

    const usageMap = {};
    (usageRes.data || []).forEach(u => {
      usageMap[u.feature_key] = u.current_usage;
    });

    return {
      plan: { key: planKey, name: planRecord?.name ?? planKey, id: planId },
      entitlements: this._entitlementsMap(entitlementsRes.data),
      usage: usageMap
    };
  }

  /** Shape a plan_entitlements result set into a feature_key → entitlement map. */
  _entitlementsMap(rows) {
    const map = {};
    (rows || []).forEach(e => {
      map[e.feature_key] = {
        value: e.feature_value_int, // might be null for text features
        textValue: e.feature_value_text,
        isUnlimited: e.is_unlimited
      };
    });
    return map;
  }

  /** Fetch the entitlements map for any plan by its plan_key (or null). */
  async _fetchEntitlementsByPlanKey(planKey) {
    const { data: planRecord } = await supabase
      .from('plans')
      .select('id')
      .eq('plan_key', planKey)
      .single();

    if (!planRecord?.id) return null;

    const { data } = await supabase
      .from('plan_entitlements')
      .select('*')
      .eq('plan_id', planRecord.id);

    return this._entitlementsMap(data);
  }

  /**
   * Generic check for numeric limits (guides, bundles, storage, editors).
   */
  _checkNumericLimit(entitlements, usage, key, incrementAmount = 0) {
    // Entitlement keys often have _max suffix in plan_entitlements vs user_usage
    // user_usage key: 'active_guides'
    // plan_entitlements key: 'active_guides_max'
    const limitKey = `${key}_max`;
    const entitlement = entitlements[limitKey];

    // If no entitlement defined, assume restricted (or allowed? usually restricted 0)
    // If entitlement says unlimited, allow.
    if (entitlement && entitlement.isUnlimited) {
      return this._allow(null, 0); // Limit 0 implies unlimited in some contexts, or use Infinity
    }

    const limit = entitlement ? entitlement.value : 0;
    const current = usage[key] || 0;
    const projected = current + incrementAmount;

    if (projected > limit) {
      // Reason code mapping
      const codeMap = {
        'active_guides': 'LIMIT_ACTIVE_GUIDES',
        'bundles': 'LIMIT_BUNDLES',
        'storage_bytes': 'LIMIT_STORAGE',
        'editors': 'LIMIT_EDITORS'
      };
      return this._deny(codeMap[key] || 'LIMIT_REACHED', limit, current);
    }

    return this._allow(limit, current);
  }

  /**
   * Check string-based tiers (templates).
   */
  _checkTier(entitlements, requestedTier) {
    // defined tiers: 'starter' < 'full'
    // If requested is null/undefined, allow
    if (!requestedTier) return this._allow();

    const entitlement = entitlements['templates_tier'];
    const currentTier = entitlement ? entitlement.textValue : 'starter';

    // Simple hierarchy check
    const tiers = ['starter', 'full'];
    const currentIdx = tiers.indexOf(currentTier);
    const requestedIdx = tiers.indexOf(requestedTier);

    if (requestedIdx > currentIdx) {
      return this._deny('LIMIT_TEMPLATES', null, null);
    }

    return this._allow();
  }

  _allow(limit = null, current = null) {
    return {
      allowed: true,
      reason_code: null,
      limit,
      current,
      upgrade_suggestion: null
    };
  }

  _deny(reason, limit = null, current = null) {
    return {
      allowed: false,
      reason_code: reason,
      limit,
      current,
      upgrade_suggestion: null // populated later
    };
  }

  /**
   * Suggests next plan based on current plan and failure reason.
   */
  _getUpgradeSuggestion(currentPlanName, reasonCode) {
    const plan = currentPlanName.toLowerCase();

    if (plan === 'family') return null; // Top tier

    // Special logic for editor limits on Free/Couple
    if (reasonCode === 'LIMIT_EDITORS') {
        if (plan === 'free') return 'couple';
        if (plan === 'couple') return 'family';
    }

    // Default progression
    if (plan === 'free') return 'couple';
    if (plan === 'couple') return 'family';

    return 'couple'; // Fallback
  }

  _logCheck(userId, action, result) {
    const logData = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      allowed: result.allowed,
      reason: result.reason_code,
      current: result.current,
      limit: result.limit
    };

    if (result.allowed) {
        // Reduced noise for successes, maybe just debug
        // console.debug('Entitlement Pass:', logData);
    } else {
        console.warn('Entitlement Denied:', logData);
    }
  }

  /**
   * Force invalidate cache for a user (call this after plan upgrade)
   */
  invalidateCache(userId) {
    this.cache.delete(userId);
    // Plan-keyed limits are plan definitions, not user state, but clear them too
    // so a limit change picked up after an upgrade isn't masked by a stale entry.
    this._planLimitsCache.clear();
  }

  /**
   * Extract the numeric limits relevant to tier-limit read-only enforcement
   * from an entitlements map. `null` for any limit means unlimited. A missing
   * entitlement is treated as unlimited (fail open), matching the DB functions.
   */
  _numericLimitsFromEntitlements(entitlements = {}) {
    const numeric = (key) => {
      const e = entitlements[`${key}_max`];
      if (!e) return null; // missing entitlement → treat as unlimited (fail open)
      return e.isUnlimited ? null : e.value;
    };
    return {
      active_guides: numeric('active_guides'),
      bundles: numeric('bundles'),
      storage_bytes: numeric('storage_bytes'),
      editors: numeric('editors'),
    };
  }

  /**
   * Returns the user's numeric plan limits for the resources affected by
   * tier-limit read-only enforcement. `null` for any limit means unlimited
   * (Family plan).
   *
   * Reuses the same cached data as canPerform(), so this is cheap to call
   * alongside other entitlement checks.
   *
   * @param {string} userId
   * @returns {Promise<{active_guides: number|null, bundles: number|null, storage_bytes: number|null, editors: number|null}|null>}
   */
  async getPlanLimits(userId) {
    if (!userId) return null;
    const data = await this._getUserData(userId);
    if (!data) return null;
    return this._numericLimitsFromEntitlements(data.entitlements || {});
  }

  /**
   * Returns the numeric limits for an arbitrary plan by plan_key (e.g. to
   * preview a downgrade target's limits), sourced from plan_entitlements.
   * Cached per plan_key for the same TTL as user data.
   *
   * @param {string} planKey
   * @returns {Promise<{active_guides: number|null, bundles: number|null, storage_bytes: number|null, editors: number|null}|null>}
   */
  async getPlanLimitsByKey(planKey) {
    if (!planKey) return null;

    const now = Date.now();
    const cached = this._planLimitsCache.get(planKey);
    if (cached && (now - cached.timestamp < this.TTL)) return cached.data;

    const entitlements = this._dataFetcher
      ? (await this._dataFetcher(null, planKey))?.entitlements
      : await this._fetchEntitlementsByPlanKey(planKey);

    if (!entitlements) return null;

    const limits = this._numericLimitsFromEntitlements(entitlements);
    this._planLimitsCache.set(planKey, { data: limits, timestamp: now });
    return limits;
  }
}

export const entitlementService = new EntitlementService();
