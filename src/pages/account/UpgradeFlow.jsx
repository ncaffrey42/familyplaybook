import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent } from "@/components/ui/card";
import { PLANS, PLAN_KEYS, PLAN_ORDER } from '@/lib/plans';

// Paid plans in tier order, built directly from plans.js (no API call needed)
const UPGRADE_PLANS = PLAN_ORDER
  .filter(key => key !== PLAN_KEYS.FREE)
  .map(key => ({ key, ...PLANS[key] }));

const UpgradeFlow = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { createCheckoutSession, fetchSubscription } = useSubscription();
  const { toast } = useToast();

  const [selectedPlanKey, setSelectedPlanKey] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const sessionId = searchParams.get('session_id');

  // Pre-select based on navigation state suggestion
  useEffect(() => {
    const suggestion = (location.state?.suggestion || location.state?.targetPlan || PLAN_KEYS.COUPLE).toLowerCase();
    const match = UPGRADE_PLANS.find(p => p.key === suggestion);
    setSelectedPlanKey(match ? match.key : UPGRADE_PLANS[0].key);
  }, [location.state]);

  // Handle return from Stripe
  useEffect(() => {
    if (sessionId) {
      setVerifying(true);
      const verify = async () => {
        try {
          await new Promise(r => setTimeout(r, 2000)); // Wait for webhook
          await fetchSubscription();
          toast({ title: "Upgrade Successful", description: "Your plan has been updated!", variant: "success" });
        } catch (e) {
          console.error(e);
          toast({ title: "Verification Error", description: "Please check your subscription status.", variant: "destructive" });
        } finally {
          setVerifying(false);
        }
      };
      verify();
    }
  }, [sessionId, fetchSubscription, toast]);

  const handleCheckout = async () => {
    if (!selectedPlanKey) return;
    setProcessing(true);

    try {
      const { url } = await createCheckoutSession(selectedPlanKey, 'month');
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      setProcessing(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin h-12 w-12 text-[#5CA9E9]" />
        <h2 className="text-xl font-semibold">Updating your plan...</h2>
        <p className="text-gray-500">Please wait while we confirm your payment.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">Upgrade your Plan</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Choose the plan that fits your family's needs.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <RadioGroup value={selectedPlanKey} onValueChange={setSelectedPlanKey} className="space-y-4">
              {UPGRADE_PLANS.map((plan) => (
                <div
                  key={plan.key}
                  className={`relative rounded-xl border-2 p-4 flex cursor-pointer transition-all ${selectedPlanKey === plan.key ? 'border-[#5CA9E9] bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 hover:border-gray-300 dark:border-gray-800'}`}
                  onClick={() => setSelectedPlanKey(plan.key)}
                >
                  <RadioGroupItem value={plan.key} id={plan.key} className="sr-only" />
                  <div className="flex-1">
                    <Label htmlFor={plan.key} className="cursor-pointer">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-lg font-bold text-gray-900 dark:text-white">{plan.displayName}</span>
                        {selectedPlanKey === plan.key && <CheckCircle2 className="text-[#5CA9E9] h-5 w-5" />}
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                        From ${plan.price.month}/mo
                      </div>
                    </Label>
                  </div>
                </div>
              ))}
            </RadioGroup>

            <div className="mt-8">
              <Button
                onClick={handleCheckout}
                disabled={processing || !selectedPlanKey}
                className="w-full h-12 text-base"
              >
                {processing ? <Loader2 className="animate-spin mr-2" /> : "Proceed to Checkout"}
                {!processing && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </div>

            <div className="mt-6 flex justify-center text-sm text-gray-500 gap-2 items-center">
              <ShieldCheck size={16} className="text-green-500" /> Secure payment via Stripe
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UpgradeFlow;
