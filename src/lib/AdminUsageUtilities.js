import { supabase } from '@/lib/customSupabaseClient';
import { UsageTrackingService } from './UsageTrackingService';

/**
 * Admin utilities for reconciling and auditing usage data.
 */
export const AdminUsageUtilities = {
  
  /**
   * Forces a recalculation for a user and returns diff details.
   */
  recalculateUserUsage: async (userId) => {
    // 1. Fetch old values
    const { data: oldRows } = await supabase
      .from('user_usage')
      .select('feature_key, current_usage')
      .eq('user_id', userId);
    
    const oldValues = {};
    (oldRows || []).forEach(r => oldValues[r.feature_key] = r.current_usage);

    // 2. Recalculate
    const newValues = await UsageTrackingService.recalculateUsageMetrics(userId);

    // 3. Compare
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
      hasChanges
    };

    console.log('[Admin] Recalculation Result:', result);
    return result;
  },

  /**
   * Iterates through all users (client-side batching) and reconciles usage.
   * WARNING: High impact operation. Use sparingly.
   */
  reconcileUsageForAllUsers: async (batchSize = 50) => {
    console.log('[Admin] Starting Global Reconciliation...');
    let totalUsers = 0;
    let discrepancies = 0;
    let errors = 0;
    const report = [];

    try {
      // 1. Get all users from profiles (safer than auth.users which is restricted)
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const total = count || 0;
      
      for (let i = 0; i < total; i += batchSize) {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, full_name')
          .range(i, i + batchSize - 1);

        if (!users) break;

        // Process batch
        const promises = users.map(u => AdminUsageUtilities.recalculateUserUsage(u.id));
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
    // Requires joining user_subscriptions -> plans -> plan_entitlements AND user_usage.
    // This is complex to do purely client side efficiently.
    // We will do a simplified check for fetched users.
    
    // This is a placeholder for what would ideally be a SQL view or report.
    console.warn("getUsageAnomalies is resource intensive and should be run via backend script.");
    return { error: "Not implemented for client-side safety" };
  }
};