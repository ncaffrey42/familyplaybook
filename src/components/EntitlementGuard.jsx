import React, { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { useEntitlements } from '@/contexts/EntitlementContext';
import { useLimitNotification } from '@/contexts/LimitNotificationContext';

/**
 * EntitlementGuard
 *
 * Wraps UI that should only be interactive when the user is within their plan
 * limits. Checks the entitlement on mount; if denied, renders children in a
 * visually-locked overlay and opens the upgrade modal on interaction.
 *
 * Props:
 *   action  — action key from EntitlementService.ACTIONS
 *             ('GUIDE_CREATE' | 'BUNDLE_CREATE' | 'EDITOR_INVITE' | 'FILE_UPLOAD' | …)
 *   payload — extra data forwarded to canPerform (e.g. { file_size_bytes })
 *   skip    — bypass the guard entirely (use for edit flows where no new resource is created)
 */
const EntitlementGuard = ({ action, payload = {}, skip = false, children }) => {
  const { checkEntitlement } = useEntitlements();
  const { showLimitNotification } = useLimitNotification();
  const [status, setStatus] = useState({ loading: true, allowed: true, result: null });
  // Stable ref so the check only re-runs when action/skip change, not on every render
  const payloadRef = useRef(payload);

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