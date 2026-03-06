import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { UsageTrackingService } from '@/lib/UsageTrackingService';
import { UsageUpdateTriggers } from '@/lib/UsageUpdateTriggers';
import { UsageEnforcement } from '@/lib/UsageEnforcement';
import { entitlementService } from '@/lib/EntitlementService';

const UsageContext = createContext();

export const UsageTrackingProvider = ({ children }) => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshUsage = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await UsageTrackingService.getUsageMetrics(user.id);
      setMetrics(data);
      // Also invalidate entitlement cache to ensure they are in sync
      entitlementService.invalidateCache(user.id);
    } catch (e) {
      console.error("Usage refresh failed", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      refreshUsage();
    } else {
      setMetrics(null);
    }
  }, [user, refreshUsage]);

  const updateUsage = async (metricKey, delta) => {
    if (!user) return;
    await UsageTrackingService.updateUsageMetric(user.id, metricKey, delta);
    // Optimistic update locally? or just refresh
    // For simplicity, refresh after short delay or assume service updated DB
    await refreshUsage();
  };

  const checkActionAllowed = async (action, payload) => {
    if (!user) return { allowed: false, reason: 'Login required' };
    return UsageEnforcement.checkUsageAllowed(user.id, action, payload);
  };

  const value = {
    metrics,
    loading,
    refreshUsage,
    updateUsage,
    checkActionAllowed,
    triggers: UsageUpdateTriggers,
    getOverLimitActions: () => user ? UsageEnforcement.getOverLimitActions(user.id) : [],
    getCleanupActions: () => user ? UsageEnforcement.getCleanupActions(user.id) : []
  };

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
};

export const useUsageContext = () => {
  const context = useContext(UsageContext);
  if (context === undefined) {
    throw new Error('useUsageContext must be used within a UsageTrackingProvider');
  }
  return context;
};