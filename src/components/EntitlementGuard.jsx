import React, { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { useEntitlements } from '@/contexts/EntitlementContext';
import { useLimitNotification } from '@/contexts/LimitNotificationContext';

/**
 * EntitlementGuard
 *
 * Wraps UI that should only be interactive when the user is within their plan
 * limits. Checks the entitlement on mount and whenever the user returns to the
 * tab (visibilitychange → visible), so cross-tab guide/bundle creation is
 * reflected without a page reload.
 *
 * Props:
 *   action  — action key from EntitlementService.ACTIONS
 *             ('GUIDE_CREATE' | 'BUNDLE_CREATE' | 'EDITOR_INVITE' | 'FILE_UPLOAD' | …)
 *   payload — extra data forwarded to canPerform (e.g. { file_size_bytes })
 *   skip    — bypass the guard entirely (use for edit flows where no new resource is created)
 */
const EntitlementGuard = ({ action, payload = {}, skip = false, children }) => {
  const { checkEntitlement, refreshEntitlements } = useEntitlements();
  const { showLimitNotification } = useLimitNotification();
  const [status, setStatus] = useState({ loading: true, allowed: true, result: null });
  // Stable ref so the check only re-runs when action/skip change, not on every render
  const payloadRef = useRef(payload);

  // Mount check — also re-runs when action or skip changes
  useEffect(() => {
    if (skip) {
      setStatus({ loading: false, allowed: true, result: null });
      return;
    }

    let cancelled = false;
    checkEntitlement(action, payloadRef.current).then((result) => {
      if (!cancelled) setStatus({ loading: false, allowed: result.allowed, result });
    });
    return () => { cancelled = true; };
  }, [action, skip, checkEntitlement]);

  // Stale-guard fix: when the user returns to this tab, invalidate the
  // service-layer cache and re-run the check so cross-tab changes
  // (e.g. a guide created in another tab) are reflected immediately.
  useEffect(() => {
    if (skip) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      refreshEntitlements();
      checkEntitlement(action, payloadRef.current).then((result) => {
        setStatus({ loading: false, allowed: result.allowed, result });
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [action, skip, checkEntitlement, refreshEntitlements]);

  if (status.loading) return null;

  if (status.allowed) return <>{children}</>;

  const handleLockedInteraction = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { reason_code, current, limit, upgrade_suggestion } = status.result;
    showLimitNotification(reason_code, current, limit, upgrade_suggestion);
  };

  return (
    <div
      className="relative"
      onClick={handleLockedInteraction}
      onKeyDown={(e) => e.key === 'Enter' && handleLockedInteraction(e)}
      role="button"
      tabIndex={0}
      aria-label="Upgrade required to use this feature"
    >
      <div className="pointer-events-none select-none opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center cursor-pointer">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-900/75 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm">
          <Lock size={11} />
          Upgrade to unlock
        </span>
      </div>
    </div>
  );
};

export default EntitlementGuard;