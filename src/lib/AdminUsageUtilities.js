import { supabase } from '@/lib/supabaseClient';
import { UsageTrackingService } from '@/services/UsageTrackingService';

// Verifies the current session belongs to an admin.
// app_metadata can only be written by the Supabase service role key — it cannot
// be forged by a client — so this is safe to use as an authorization check.
// To grant admin access: set app_metadata = { "role": "admin" } via the
// Supabase dashboard (Authentication → Users) or a server-side function.
const verifyAdmin = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('AdminUsageUtilities: not authenticated');
  if (user.app_metadata?.role !== 'admin') {
    throw new Error('AdminUsageUtilities: admin role required');
  }
};

// Internal recalculation — no auth check, called only from within verified functions.
const recalculateForUser = async (userId) => {
  const { data: oldRows } = await supabase
    .from('user_usage')
    .select('feature_key, current_usage')
    .eq('user_id', userId);

  const oldValues = {};
  (oldRows || []).forEach(r => oldValues[r.feature_key] = r.current_usage);

  const newValues = await UsageTrackingService.recalculateUsageMetrics(userId);

  const changes = {};
  let hasChanges = false;
  Object.keys(newValues || {}).forEach(key => {
    const old = oldValues[key] || 0;
    const current = newValues[key];
    if (old !== current) {
      changes[key] = { from: old, to: current };
      hasChanges = true;
    }
  });

  const result = {
    userId,
    timestamp: new Date().toISOString(),
    success: !!newValues,
    oldValues,
    newValues,
    changes,
    hasChanges,
  };
  console.log('[Admin] Recalculation Result:', result);
  return result;
};

/**
 * Admin utilities for reconciling and auditing usage data.
 * All exported functions call verifyAdmin() before touching any data.
 */
export const AdminUsageUtilities = {

  /**
   * Forces a recalculation for a single user and returns diff details.
   */
  recalculateUserUsage: async (userId) => {
    await verifyAdmin();
    return recalculateForUser(userId);
  },

  /**
   * Iterates through all users (client-side batching) and reconciles usage.
   * WARNING: High impact operation. Use sparingly.
   */
  reconcileUsageForAllUsers: async (batchSize = 50) => {
    await verifyAdmin();
    console.log('[Admin] Starting Global Reconciliation...');
    let totalUsers = 0;
    let discrepancies = 0;
    let errors = 0;
    const report = [];

    try {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const total = count || 0;

      for (let i = 0; i < total; i += batchSize) {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, full_name')
          .range(i, i + batchSize - 1);

        if (!users) break;

        // verifyAdmin already passed — use the internal helper to avoid N redundant auth calls
        const promises = users.map(u => recalculateForUser(u.id));
        const results = await Promise.all(promises);

        results.forEach(res => {
          totalUsers++;
          if (res.hasChanges) {
            discrepancies++;
            report.push({ userId: res.userId, changes: res.changes });
          }
        });
        
        console.log(`[Admin] Processed ${Math.min(i + batchSize, total)}/${total} users...`);
      }
    } catch (e) {
      console.error('[Admin] Global reconciliation failed:', e);
      errors++;
    }

    return {
      total_users: totalUsers,
      discrepancies_found: discrepancies,
      errors,
      details: report
    };
  },

  /**
   * Identifies users who are exceeding their plan limits.
   */
  getUsageAnomalies: async () => {
    await verifyAdmin();
    // Requires joining user_subscriptions -> plans -> plan_entitlements AND user_usage.
    // This is complex to do purely client side efficiently.
    // We will do a simplified check for fetched users.
    
    // This is a placeholder for what would ideally be a SQL view or report.
    console.warn("getUsageAnomalies is resource intensive and should be run via backend script.");
    return { error: "Not implemented for client-side safety" };
  }
};