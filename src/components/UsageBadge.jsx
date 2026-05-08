import React from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { PLANS } from '@/lib/plans';
import { cn } from '@/lib/utils';

/**
 * Compact "X of Y guides" / "X of Y bundles" indicator.
 *
 * Renders nothing on unlimited plans (Family) so the header isn't cluttered
 * with `12 of ∞` style noise. Adds a lock icon and amber tint when the
 * count is at or over the limit so the user has a glanceable signal that
 * read-only kicks in for any items beyond the limit.
 *
 * Counts come from props because the canonical sources differ per surface
 * (allGuides vs allBundles), and we want the badge to update in real time
 * without a roundtrip through the entitlement cache.
 */
const UsageBadge = ({ resourceType, current }) => {
  const { planKey } = useAuth();
  const plan = PLANS[planKey] || PLANS.free;
  const limit = resourceType === 'bundle'
    ? plan.limits.bundles
    : plan.limits.active_guides;

  if (limit === null || limit === undefined) return null;

  const count = Number.isFinite(current) ? current : 0;
  const overLimit = count > limit;
  const atLimit = count >= limit;

  const noun = resourceType === 'bundle'
    ? (limit === 1 ? 'bundle' : 'bundles')
    : (limit === 1 ? 'guide' : 'guides');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        overLimit || atLimit
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
          : 'bg-muted text-muted-foreground'
      )}
      aria-label={`${count} of ${limit} ${noun} used`}
      title={overLimit ? 'Older items beyond the limit are read-only — upgrade to edit them' : undefined}
    >
      {(overLimit || atLimit) && <Lock size={11} strokeWidth={3} />}
      {count} of {limit} {noun}
    </span>
  );
};

export default UsageBadge;
