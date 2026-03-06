import React, { useState, useEffect } from 'react';
import { useEntitlements } from '@/contexts/EntitlementContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

/**
 * Wraps content that requires specific entitlements.
 * @param {string} action - The action to check (e.g., 'GUIDE_CREATE')
 * @param {object} payload - Optional payload for the check
 * @param {React.ReactNode} fallback - Component to render if denied
 * @param {boolean} showToast - Whether to show a toast on denial (default false to avoid spam)
 */
const EntitlementGuard = ({ 
  action, 
  payload = {}, 
  fallback = null, 
  children,
  showToast = false 
}) => {
  const { checkEntitlement } = useEntitlements();
  const [isAllowed, setIsAllowed] = useState(null); // null = loading
  const [checkResult, setCheckResult] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    const performCheck = async () => {
      const result = await checkEntitlement(action, payload);
      
      if (mounted) {
        setIsAllowed(result.allowed);
        setCheckResult(result);

        if (!result.allowed && showToast) {
           toast({
             variant: "destructive",
             title: "Feature Limit Reached",
             description: `Limit: ${result.limit}. Current: ${result.current}. Upgrade to ${result.upgrade_suggestion} for more!`,
           });
        }
      }
    };

    performCheck();
    return () => { mounted = false; };
  }, [action, JSON.stringify(payload), checkEntitlement, showToast, toast]);

  if (isAllowed === null) {
    // Loading state - could be a spinner or just render nothing
    // For guards, usually render nothing until confirmed
    return null; 
  }

  if (isAllowed) {
    return <>{children}</>;
  }

  // Denied
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default fallback if none provided: Upgrade CTA
  return (
    <div className="p-6 border border-dashed rounded-lg text-center space-y-3 bg-gray-50">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
        <Sparkles className="h-5 w-5 text-amber-600" />
      </div>
      <h3 className="font-semibold">Upgrade to Access</h3>
      <p className="text-sm text-gray-500 max-w-xs mx-auto">
        You've reached the limit for this feature on your current plan.
      </p>
      {checkResult?.upgrade_suggestion && (
        <Button size="sm" variant="default" className="mt-2">
          Upgrade to {checkResult.upgrade_suggestion}
        </Button>
      )}
    </div>
  );
};

export default EntitlementGuard;