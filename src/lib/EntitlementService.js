import { supabase } from './customSupabaseClient';

/**
 * Service to handle user entitlement checks based on subscription plans.
 */
class EntitlementService {
  constructor() {
    // Cache structure: Map<userId, { data: UserEntitlements, timestamp: number }>
    this.cache = new Map();
    this.TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    
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
          // Check if unarchiving pushes over active limit
          result = this._checkNumericLimit(entitlements, usage, 'active_guides', 1);
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

      // 3. Add upgrade suggestion if denied
      if (!result.allowed) {
        result.upgrade_suggestion = this._getUpgradeSuggestion(plan.name, result.reason_code);
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
   * Fetches or retrieves cached user entitlement data.
   */
  async _getUserData(userId) {
    const now = Date.now();
    const cached = this.cache.get(userId);

    if (cached && (now - cached.timestamp < this.TTL)) {
      return cached.data;
    }

    // Fetch fresh data
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select(`
        plan_id,
        plans ( name ),
        status
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (subError) {
      console.error('Error fetching subscription:', subError);
      return null;
    }

    // Default to Free if no sub found (or handle as error depending on business logic)
    // Here assuming 'Free' plan exists if no active sub, or we just fail.
    // Let's assume we need a valid plan. If not found, maybe they are new or error.
    // For safety, let's try to fetch free plan details if no sub.
    let planName = subscription?.plans?.name || 'Free';
    let planId = subscription?.plan_id;

    if (!planId) {
       // Fallback fetch free plan ID
       const { data: freePlan } = await supabase.from('plans').select('id, name').eq('name', 'Free').single();
       if (freePlan) {
         planId = freePlan.id;
         planName = freePlan.name;
       }
    }

    if (!planId) return null; // Critical failure

    // Parallel fetch entitlements and usage
    const [entitlementsRes, usageRes] = await Promise.all([
      supabase.from('plan_entitlements').select('*').eq('plan_id', planId),
      supabase.from('user_usage').select('*').eq('user_id', userId)
    ]);

    const entitlementsMap = {};
    (entitlementsRes.data || []).forEach(e => {
      entitlementsMap[e.feature_key] = {
        value: e.feature_value_int, // might be null for text features
        textValue: e.feature_value_text,
        isUnlimited: e.is_unlimited
      };
    });

    const usageMap = {};
    (usageRes.data || []).forEach(u => {
      usageMap[u.feature_key] = u.current_usage;
    });

    const combinedData = {
      plan: { name: planName, id: planId },
      entitlements: entitlementsMap,
      usage: usageMap
    };

    this.cache.set(userId, { data: combinedData, timestamp: now });
    return combinedData;
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

    // Special logic for editor limits on Free/Couples
    if (reasonCode === 'LIMIT_EDITORS') {
        if (plan === 'free') return 'couples'; // 1 -> 2
        if (plan === 'couples') return 'family'; // 2 -> 10
    }

    // Default progression
    if (plan === 'free') return 'couples';
    if (plan === 'couples') return 'family';

    return 'couples'; // Fallback
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
  }
}

export const entitlementService = new EntitlementService();