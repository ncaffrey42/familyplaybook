import { useState, useEffect, useCallback } from 'react';
import { UsageTrackingService } from '@/services/UsageTrackingService';
import { entitlementService } from '@/services/EntitlementService';
import { UsageUpdateTriggers } from '@/lib/UsageUpdateTriggers';

/**
 * Hook to fetch and subscribe to usage metrics for a user.
 */
export const useUsage = (userId) => {
  const [metrics, setMetrics] = useState({
    active_guides: 0,
    archived_guides: 0,
    bundles: 0,
    editors: 0,
    storage_bytes: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMetrics = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await UsageTrackingService.getUsageMetrics(userId);
      if (data) setMetrics(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { ...metrics, loading, error, refetch: fetchMetrics };
};

/**
 * Hook to check if a specific action is allowed against limits.
 */
export const useUsageLimit = (userId, action) => {
  const [status, setStatus] = useState({
    current: 0,
    limit: null,
    allowed: true,
    reason: null,
    loading: true
  });

  const check = useCallback(async () => {
    if (!userId || !action) return;
    
    // We use EntitlementService here as it already orchestrates plan + usage
    const result = await entitlementService.canPerform(userId, action);
    
    setStatus({
      current: result.current,
      limit: result.limit,
      allowed: result.allowed,
      reason: result.reason_code,
      loading: false
    });
  }, [userId, action]);

  useEffect(() => {
    check();
  }, [check]);

  return { ...status, check };
};

/**
 * Hook providing access to trigger updates.
 */
export const useUsageTracking = () => {
  return {
    updateUsage: UsageTrackingService.updateUsageMetric,
    triggers: UsageUpdateTriggers
  };
};