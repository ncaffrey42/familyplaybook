import React, { useState, useMemo } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Lock } from 'lucide-react';
import { PLANS, PLAN_KEYS } from '@/lib/plans';

/**
 * Pre-downgrade confirmation modal.
 *
 * Tells the user, *before* the plan change actually happens, exactly how many
 * of their guides and bundles will become read-only on the new tier. There's
 * no forced selection — the read-only set is chosen automatically by
 * `updated_at DESC` (the N most recently updated stay editable, the rest
 * become read-only) and that ordering is described in copy below.
 *
 * Read-only is always reversible via upgrade, so this is informational, not
 * destructive.
 */
const DowngradeFlow = ({ isOpen, onClose, targetPlanName }) => {
  const { downgradeSubscription, subscription } = useSubscription();
  const [loading, setLoading] = useState(false);

  // Translate "Free" / "Couple" / "Family" → plan_key. Falls back to free.
  const targetPlanKey = useMemo(() => {
    const match = Object.values(PLAN_KEYS).find(
      key => PLANS[key].displayName.toLowerCase() === String(targetPlanName || '').toLowerCase()
    );
    return match || PLAN_KEYS.FREE;
  }, [targetPlanName]);

  const targetLimits = PLANS[targetPlanKey].limits;
  const usage = subscription?.usage || {};
  const currentGuides = usage.active_guides || 0;
  const currentBundles = usage.bundles || 0;

  const guidesOver = targetLimits.active_guides === null
    ? 0
    : Math.max(0, currentGuides - targetLimits.active_guides);
  const bundlesOver = targetLimits.bundles === null
    ? 0
    : Math.max(0, currentBundles - targetLimits.bundles);

  const willHaveReadOnly = guidesOver > 0 || bundlesOver > 0;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await downgradeSubscription(targetPlanKey);
      onClose();
    } catch (error) {
      // Hook surfaces the error toast; just leave the modal open.
    } finally {
      setLoading(false);
    }
  };

  const summaryParts = [];
  if (guidesOver > 0) summaryParts.push(`${guidesOver} ${guidesOver === 1 ? 'guide' : 'guides'}`);
  if (bundlesOver > 0) summaryParts.push(`${bundlesOver} ${bundlesOver === 1 ? 'bundle' : 'bundles'}`);
  const summary = summaryParts.join(' and ');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to {PLANS[targetPlanKey].displayName}?</DialogTitle>
          <DialogDescription>
            Your new billing rate applies at the start of the next billing cycle.
          </DialogDescription>
        </DialogHeader>

        {willHaveReadOnly && (
          <div className="my-2 flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4">
            <Lock size={18} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                {summary} will become read-only.
              </p>
              <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
                Your most recently edited items stay editable; the rest are
                still visible and shareable, just not editable. Upgrade
                anytime to restore editing.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
            Confirm Downgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DowngradeFlow;
