import { supabase } from '@/lib/supabaseClient';
import { UsageLogging } from '@/lib/UsageLogging';

/**
 * Service to manage and track user usage metrics.
 * Handles reading from cache, atomic updates, and full recalculation.
 */
export const UsageTrackingService = {
  
  /**
   * Get current usage metrics for a user.
   * Checks cache (DB table) first. 
   * @param {string} userId 
   * @returns {Promise<Object>} Map of metric keys to values
   */
  getUsageMetrics: async (userId) => {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('user_usage')
        .select('feature_key, current_usage, updated_at')
        .eq('user_id', userId);

      if (error) throw error;

      // Convert array to map
      const metrics = {};
      let needsRecalc = false;
      const ONE_HOUR = 60 * 60 * 1000;

      data.forEach(row => {
        metrics[row.feature_key] = row.current_usage;
        
        // Check for stale data
        if (new Date(row.updated_at).getTime() < Date.now() - ONE_HOUR) {
          needsRecalc = true;
        }
      });

      // Default zeros if missing
      const defaults = ['active_guides', 'archived_guides', 'bundles', 'editors', 'storage_bytes'];
      defaults.forEach(key => {
        if (metrics[key] === undefined) metrics[key] = 0;
      });

      // Trigger background recalc if stale or missing data
      if (needsRecalc || data.length === 0) {
        // Don't await this, let it run in background
        UsageTrackingService.recalculateUsageMetrics(userId).catch(console.error);
      }

      return metrics;
    } catch (err) {
      console.error('Error fetching usage metrics:', err);
      return null;
    }
  },

  /**
   * recalculateUsageMetrics
   * Computes all metrics from scratch using DB/Storage queries.
   * Uses a Postgres RPC function for efficiency and atomicity.
   */
  recalculateUsageMetrics: async (userId) => {
    if (!userId) return null;

    try {
      // Use the RPC function we created in the migration
      const { data, error } = await supabase.rpc('recalculate_usage_stats', { 
        target_user_id: userId 
      });

      if (error) throw error;

      UsageLogging.logRecalculation(userId, data);
      return data;
    } catch (err) {
      console.error('Error recalculating usage:', err);
      // Fallback: Return what we can if RPC fails? 
      // For now just re-throw or return null
      return null;
    }
  },

  /**
   * updateUsageMetric
   * Atomically updates a specific usage metric.
   * @param {string} userId 
   * @param {string} metricKey 
   * @param {number} delta (positive to increment, negative to decrement)
   */
  updateUsageMetric: async (userId, metricKey, delta) => {
    if (!userId || delta === 0) return;

    try {
      // Get current for logging (optimistic)
      const { data: currentRows } = await supabase
        .from('user_usage')
        .select('current_usage')
        .eq('user_id', userId)
        .eq('feature_key', metricKey)
        .single();
      
      const oldVal = currentRows?.current_usage || 0;

      // Use RPC for atomic increment
      const { error } = await supabase.rpc('increment_usage', {
        target_user_id: userId,
        key_name: metricKey,
        delta: delta
      });

      if (error) throw error;

      UsageLogging.logUsageUpdate(userId, metricKey, oldVal, oldVal + delta, 'MANUAL_UPDATE');

      return { success: true, newValue: oldVal + delta };
    } catch (err) {
      console.error(`Error updating usage ${metricKey}:`, err);
      // If atomic update fails, maybe force a recalc
      await UsageTrackingService.recalculateUsageMetrics(userId);
      return { success: false };
    }
  }
};