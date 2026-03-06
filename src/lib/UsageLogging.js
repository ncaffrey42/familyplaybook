import { supabase } from '@/lib/customSupabaseClient';

/**
 * Service for logging usage tracking events and errors.
 */

export const UsageLogging = {
  /**
   * Log a standard usage update event.
   */
  logUsageUpdate: async (userId, metric, oldValue, newValue, actionType, metadata = {}) => {
    const logData = {
      timestamp: new Date().toISOString(),
      userId,
      metric,
      oldValue,
      newValue,
      delta: newValue - oldValue,
      actionType,
      ...metadata
    };

    // Console log in dev
    if (import.meta.env.DEV) {
      console.log(`[UsageTracking] ${actionType}: ${metric} ${oldValue} -> ${newValue}`, logData);
    }

    // Persist to error_logs (repurposed for generic logs/audit in this context)
    // In a real prod app, you might have a dedicated audit_logs table.
    try {
      await supabase.from('error_logs').insert({
        user_id: userId,
        message: `USAGE_UPDATE: ${actionType} - ${metric}`,
        stack: JSON.stringify(logData), // Storing details in stack for now
        url: window.location.href,
        component_stack: 'UsageTrackingService'
      });
    } catch (e) {
      console.warn('Failed to persist usage log', e);
    }
  },

  /**
   * Log when a user attempts an action that exceeds their limits.
   */
  logUsageExceeded: async (userId, metric, current, limit, actionType) => {
    const message = `USAGE_EXCEEDED: ${actionType} blocked. ${metric}: ${current}/${limit}`;
    console.warn(message);

    try {
      await supabase.from('error_logs').insert({
        user_id: userId,
        message: message,
        stack: JSON.stringify({ userId, metric, current, limit, actionType }),
        url: window.location.href,
        component_stack: 'UsageEnforcement'
      });
    } catch (e) {
      // Ignore
    }
  },

  /**
   * Log results of a recalculation operation.
   */
  logRecalculation: async (userId, results) => {
    console.info(`[UsageTracking] Recalculated for ${userId}`, results);
    // Optional: persist if needed
  },

  /**
   * Log when an enforcement check blocks an action.
   */
  logEnforcementBlock: (userId, action, reason) => {
    console.warn(`[UsageTracking] Action Blocked: ${action} for ${userId}. Reason: ${reason}`);
  }
};