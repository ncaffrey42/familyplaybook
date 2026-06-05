import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { entitlementService } from '@/services/EntitlementService';

/**
 * Current user's numeric plan limits ({ active_guides, bundles, storage_bytes,
 * editors }), sourced from plan_entitlements via EntitlementService — the same
 * numbers RLS enforces. `null` while loading or unavailable; a `null` value for
 * an individual limit means unlimited.
 *
 * Re-fetches when the user or their plan changes. EntitlementService caches the
 * underlying lookup, so this is cheap.
 */
export function usePlanLimits() {
  const { user, planKey } = useAuth();
  const [limits, setLimits] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLimits(null);
      return;
    }
    entitlementService
      .getPlanLimits(user.id)
      .then((l) => { if (!cancelled) setLimits(l); })
      .catch(() => { if (!cancelled) setLimits(null); });
    return () => { cancelled = true; };
  }, [user?.id, planKey]);

  return limits;
}
