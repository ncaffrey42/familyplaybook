/*
 * HORIZONS "NO SIDE EFFECTS" RULE:
 * Entitlement checks must ONLY block CREATE/IMPORT/UPLOAD/INVITE actions, never VIEW/LIST/OPEN actions.
 * - Viewing a guide/bundle/pack should ALWAYS be allowed regardless of plan.
 * - Accessing the "My Account" page should ALWAYS be allowed.
 * - This context provides data; it should not perform routing side-effects.
 */

import React, { createContext, useContext, useCallback, useState } from 'react';
import { entitlementService } from '@/lib/EntitlementService';
import { useAuth } from './SupabaseAuthContext';

const EntitlementContext = createContext(null);

export const EntitlementProvider = ({ children }) => {
  const { user } = useAuth();
  const [cache, setCache] = useState({});

  /**
   * Wrapper around entitlementService.canPerform
   * Adds local react-state caching for immediate UI feedback if needed, 
   * though the service has its own cache.
   */
  const checkEntitlement = useCallback(async (action, payload = {}) => {
    if (!user) return { allowed: false, reason: 'NO_USER' };
    
    // Create a cache key based on args
    const key = `${user.id}:${action}:${JSON.stringify(payload)}`;
    
    // Simple in-memory debounce/cache could go here if service cache isn't enough
    // But we rely on service cache mostly.
    
    try {
      const result = await entitlementService.canPerform(user.id, action, payload);
      
      // Dev-only logging for denials
      if (import.meta.env.DEV && !result.allowed) {
        console.warn(`[ENTITLEMENT DENIED] Feature: ${action}, Reason: ${result.reason_code || 'Limit Reached'}`);
      }
      
      return result;
    } catch (err) {
      console.error("Entitlement check failed in context:", err);
      // Fail safe: deny
      return { allowed: false, reason_code: 'SYSTEM_ERROR' };
    }
  }, [user]);

  /**
   * Invalidate service cache manually (e.g. after successful upgrade)
   */
  const refreshEntitlements = useCallback(() => {
    if (user) entitlementService.invalidateCache(user.id);
  }, [user]);

  const value = {
    checkEntitlement,
    refreshEntitlements
  };

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
};

export const useEntitlements = () => {
  const context = useContext(EntitlementContext);
  if (!context) throw new Error("useEntitlements must be used within EntitlementProvider");
  return context;
};