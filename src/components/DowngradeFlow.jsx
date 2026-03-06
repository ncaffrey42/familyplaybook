import React, { useState, useEffect } from 'react';
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

const DowngradeFlow = ({ isOpen, onClose, targetPlanName, targetPlanId }) => {
  const { downgradeSubscription, subscription } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [checkingLimits, setCheckingLimits] = useState(true);

  // Check limits when opening
  useEffect(() => {
    if (isOpen && subscription) {
      setCheckingLimits(true);
      const check = async () => {
         // In a real app, we fetch target plan limits and compare with current usage
         // For now, we simulate basic checks
         const currentUsage = subscription.usage || {};
         // Placeholder logic: if target is Free, check against static free limits
         const newLimits = { active_guides: 1, editors: 0 }; 
         
         const warns = [];
         if (currentUsage.active_guides > newLimits.active_guides) {
             warns.push(`You have ${currentUsage.active_guides} active guides. The new plan allows ${newLimits.active_guides}. Some guides may be archived.`);
         }
         
         setWarnings(warns);
         setCheckingLimits(false);
      };
      check();
    }
  }, [isOpen, subscription]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // Find plan ID if not provided (lookup by name)
      let planId = targetPlanId;
      if (!planId) {
          const plans = await apiClient.getPlans();
          const p = plans.find(pl => pl.name === targetPlanName);
          if (p) planId = p.id;
      }
      
      if (!planId) throw new Error("Target plan not found");

      await downgradeSubscription(planId);
      onClose();
    } catch (error) {
       // handled by hook toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to {targetPlanName}?</DialogTitle>
          <DialogDescription>
             Are you sure you want to downgrade your subscription?
          </DialogDescription>
        </DialogHeader>

        {checkingLimits ? (
            <div className="py-4 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : (
            <div className="space-y-4 my-2">
                {warnings.length > 0 && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Warning: Usage Limits</AlertTitle>
                        <AlertDescription>
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                                {warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </AlertDescription>
                    </Alert>
                )}
                
                <p className="text-sm text-gray-600">
                    Your new billing rate will apply at the start of the next billing cycle. 
                    {targetPlanName === 'Free' && " Your current subscription will be canceled at the end of the period."}
                </p>
            </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading || checkingLimits}>
            {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
            Confirm Downgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DowngradeFlow;