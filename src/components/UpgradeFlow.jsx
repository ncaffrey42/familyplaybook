import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/lib/apiClient';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const UpgradeFlow = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { createCheckoutSession, fetchSubscription } = useSubscription();
  const { toast } = useToast();
  
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  
  const sessionId = searchParams.get('session_id');

  // Load plans
  useEffect(() => {
    const init = async () => {
      try {
        const allPlans = await apiClient.getPlans();
        const upgradeOptions = allPlans.filter(p => p.name !== 'Free');
        setPlans(upgradeOptions);
        
        const suggestion = location.state?.suggestion || location.state?.targetPlan || 'Couple';
        const match = upgradeOptions.find(p => p.name.toLowerCase().includes(suggestion.toLowerCase()));
        if (match) setSelectedPlanId(match.id);
        else if (upgradeOptions.length > 0) setSelectedPlanId(upgradeOptions[0].id);
      } catch (e) {
        toast({ title: "Error", description: "Failed to load upgrade options.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [location.state, toast]);

  // Handle Return from Stripe
  useEffect(() => {
    if (sessionId) {
      setVerifying(true);
      const verify = async () => {
        try {
           // We can just poll subscription for updates as webhook handles it
           // But let's verify session status for immediate feedback if needed
           // For simplicity, we assume success if redirected here and poll
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
    if (!selectedPlanId) return;
    setProcessing(true);
    
    try {
      const { url } = await createCheckoutSession(selectedPlanId, 'month');
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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-gray-400"/></div>;

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
                <RadioGroup value={selectedPlanId} onValueChange={setSelectedPlanId} className="space-y-4">
                    {plans.map((plan) => (
                    <div key={plan.id} 
                        className={`relative rounded-xl border-2 p-4 flex cursor-pointer transition-all ${selectedPlanId === plan.id ? 'border-[#5CA9E9] bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 hover:border-gray-300 dark:border-gray-800'}`}
                        onClick={() => setSelectedPlanId(plan.id)}
                    >
                        <RadioGroupItem value={plan.id} id={plan.id} className="sr-only" />
                        <div className="flex-1">
                            <Label htmlFor={plan.id} className="cursor-pointer">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</span>
                                    {selectedPlanId === plan.id && <CheckCircle2 className="text-[#5CA9E9] h-5 w-5" />}
                                </div>
                                <p className="text-sm text-gray-500 mb-3">{plan.description}</p>
                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                                    From $X.XX/mo
                                </div>
                            </Label>
                        </div>
                    </div>
                    ))}
                </RadioGroup>

                <div className="mt-8">
                    <Button
                    onClick={handleCheckout}
                    disabled={processing || !selectedPlanId}
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