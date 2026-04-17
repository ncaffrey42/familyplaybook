import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Crown, Heart, Loader2, Calendar, Shield, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Helmet } from 'react-helmet';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLocation, useNavigate } from 'react-router-dom';

const LoadingSpinner = () => (
    <div className="flex justify-center items-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
    </div>
);

const PaymentVerificationOverlay = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-6 animate-in fade-in duration-500">
        <div className="relative">
            <div className="absolute inset-0 bg-purple-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <div className="relative bg-white dark:bg-gray-800 p-6 rounded-full shadow-lg">
                <Loader2 className="h-10 w-10 text-purple-600 animate-spin" />
            </div>
        </div>
        <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Finalizing Your Upgrade</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                We're confirming your payment with Stripe. This usually takes just a few seconds...
            </p>
        </div>
        <div className="w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-600 animate-progress-indeterminate"></div>
        </div>
    </div>
);

// Plan Levels for Comparison
const PLAN_LEVELS = {
    'free': 0,
    'couple': 1,
    'family': 2
};

const PlanCard = ({ title, price, interval, features, icon: Icon, gradient, isActive, isCurrentTier, currentPlanKey, targetPlanKey, isLoading, onAction, isPastDue }) => {
    // Logic for button text & state
    let buttonText = "Upgrade";
    let isDisabled = false;

    const currentLevel = PLAN_LEVELS[currentPlanKey] || 0;
    const targetLevel = PLAN_LEVELS[targetPlanKey] || 0;

    if (isActive) {
        buttonText = "Current Plan";
        isDisabled = true;
    } else if (isCurrentTier) {
        // Same tier, different interval
        buttonText = `Switch to ${interval === 'year' ? 'Annual' : 'Monthly'}`;
    } else if (isPastDue) {
        buttonText = "Fix Payment";
        isDisabled = true; 
    } else if (targetLevel < currentLevel) {
        buttonText = "Downgrade";
    }

    return (
        <div className={cn(
            "rounded-3xl p-6 shadow-md text-white relative overflow-hidden transition-all transform hover:scale-[1.01]",
            `bg-gradient-to-br ${gradient}`,
            isActive ? "ring-4 ring-offset-2 ring-offset-[#FAF9F6] dark:ring-offset-gray-950 ring-purple-400 scale-[1.01]" : ""
        )}>
            <div className="relative z-10">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <Icon className="fill-white/20 text-white" />
                        <h3 className="text-xl font-bold">{title}</h3>
                    </div>
                    {isActive && <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase">Active</span>}
                </div>
                
                <div className="mb-6">
                    <span className="text-4xl font-bold">${price}</span>
                    <span className="opacity-80">/{interval}</span>
                </div>

                <ul className="space-y-3 mb-8">
                    {features.map((f, i) => (
                        <li key={i} className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                <Check size={12} strokeWidth={3} />
                            </div>
                            <span className="font-medium text-sm">{f}</span>
                        </li>
                    ))}
                </ul>

                <Button 
                    onClick={onAction} 
                    disabled={isDisabled || isLoading}
                    className={cn(
                        "w-full font-bold h-12 rounded-xl border-0 transition-all",
                        isActive ? "bg-white/20 text-white cursor-default" : "bg-white text-gray-900 hover:bg-white/90 shadow-lg",
                        targetLevel < currentLevel && !isActive ? "bg-white/90 text-gray-700 hover:bg-white" : ""
                    )}
                >
                    {isLoading && !isActive ? <Loader2 className="animate-spin mr-2" /> : null}
                    {buttonText}
                </Button>
            </div>
            
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        </div>
    );
};

const SubscriptionScreen = () => {
  const { toast } = useToast();
  const {
      user, isPremium, planKey, subscriptionStatus, billingInterval: currentBillingInterval,
      refreshProfile, waitForSubscriptionUpdate, loading
  } = useAuth();
  
  const [billingCycle, setBillingCycle] = useState('month');
  const [isLoading, setIsLoading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  
  const handleNavigate = useNavigation();
  const location = useLocation();
  const navigate = useNavigate();

  // Handle Return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const checkoutStatus = params.get('checkout');

    if (checkoutStatus === 'success') {
       setIsVerifyingPayment(true);
       waitForSubscriptionUpdate()
            .then((success) => {
                setIsVerifyingPayment(false);
                if (success) {
                    toast({ 
                        title: "🎉 You're all set!", 
                        description: "Your premium features are now unlocked.",
                        variant: "success",
                        duration: 5000
                    });
                } else {
                    refreshProfile();
                    toast({ 
                        title: "Taking a bit longer...", 
                        description: "Your payment is processing. Check back in a minute.", 
                    });
                }
                // Clean URL but stay on page
                navigate('/account/subscription', { replace: true });
            });
    }
  }, [location.search, refreshProfile, waitForSubscriptionUpdate, toast, navigate]);

  // Handle default tab selection
  useEffect(() => {
    if (currentBillingInterval === 'year') {
        setBillingCycle('year');
    }
  }, [currentBillingInterval]);

  const plans = {
    couple: {
      month: { price: '6.99' },
      year: { price: '69.90', label: '$5.83/mo' },
    },
    family: {
      month: { price: '13.99' },
      year: { price: '139.90', label: '$11.66/mo' },
    }
  };

  const isPastDue = subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid';
  const isPaidUser = isPremium || planKey === 'couple' || planKey === 'family';

  const handleAction = async (targetPlan, targetInterval) => {
    setIsLoading(true);
    try {
        if (isPastDue) {
            toast({ title: "Action Required", description: "Please update your payment method first.", variant: "destructive" });
            const { data } = await supabase.functions.invoke('create-portal-session');
            if (data?.url) window.location.href = data.url;
            return;
        }

        if (!isPremium || subscriptionStatus === 'canceled') {
            // New Subscription — redirect to Stripe Checkout
            const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                body: { plan_key: targetPlan, billing_interval: targetInterval },
            });
            if (error) throw error;
            if (data?.url) window.location.href = data.url;
            else throw new Error("Failed to start checkout.");
        } else {
            // Change Existing Subscription — update in-place via edge function,
            // then wait for the realtime billing update rather than polling the DB.
            const { data, error } = await supabase.functions.invoke('change-subscription-plan', {
                body: { plan_key: targetPlan, billing_interval: targetInterval },
            });
            if (error) throw error;

            if (data.success) {
                toast({ title: "Processing...", description: "We're updating your plan.", duration: 3000 });
                const success = await waitForSubscriptionUpdate(targetPlan);
                if (success) {
                    toast({ title: "Plan Changed!", description: `You are now on the ${targetPlan} plan (${targetInterval}).`, variant: "success" });
                } else {
                    toast({ title: "Update Pending", description: "It may take a moment to reflect in your dashboard." });
                }
            } else {
                throw new Error(data.error || "Failed to change plan.");
            }
        }
    } catch (error) {
        console.error('Subscription Action Error:', error);
        toast({ title: 'Error', description: error.message || "Something went wrong.", variant: 'destructive' });
    } finally {
        setIsLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
      setIsManaging(true);
      try {
          const { error } = await supabase.functions.invoke('cancel-subscription');
          if (error) throw error;
          
          toast({ title: "Subscription Canceled", description: "Your plan has been canceled.", variant: "default" });
          await refreshProfile(); 
      } catch (error) {
           toast({ title: "Error", description: "Failed to cancel.", variant: "destructive" });
      } finally {
          setIsManaging(false);
      }
  };
  
  const handleManageBilling = async () => {
    setIsManaging(true);
    try {
        const { data } = await supabase.functions.invoke('create-portal-session');
        if (data?.url) window.location.href = data.url;
    } catch (e) {
        toast({ title: "Error", description: "Could not open billing portal.", variant: "destructive" });
    } finally {
        setIsManaging(false);
    }
  };

  const isCurrentPlanCard = (pKey) => {
      if (!isPaidUser) return false;
      return planKey === pKey; 
  };
  
  const isCurrentInterval = (pKey, interval) => {
      if (!isCurrentPlanCard(pKey)) return false;
      const currentInterval = currentBillingInterval || 'month';
      return currentInterval === interval;
  };

  if (loading || !user) return <LoadingSpinner />;

  return (
    <>
      <Helmet>
        <title>Subscription Plans - Family Playbook</title>
      </Helmet>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-gray-950 pb-12">
        <div className="p-6">
          <PageHeader title="Subscription Plans" onBack={() => handleNavigate('account')} />
          
          <AnimatePresence mode="wait">
            {isVerifyingPayment ? (
                 <motion.div 
                    key="verifying"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <PaymentVerificationOverlay />
                </motion.div>
            ) : (
                <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    {isPastDue && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-xl mb-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="text-red-600" />
                                <div>
                                    <p className="font-bold text-red-700 dark:text-red-400">Payment Update Needed</p>
                                    <p className="text-sm text-red-600 dark:text-red-300">Your last payment failed. Please update your card.</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleManageBilling} className="border-red-200 text-red-700 hover:bg-red-100">
                                Fix Now
                            </Button>
                        </div>
                    )}
            
                    <div className="flex justify-center mb-8">
                        <div className="inline-flex bg-gray-200/70 dark:bg-gray-800 rounded-full p-1 h-12">
                            <button 
                                onClick={() => setBillingCycle('month')}
                                className={cn("rounded-full px-6 h-10 text-sm font-medium transition-all", billingCycle === 'month' ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400")}
                            >
                                Monthly
                            </button>
                            <button 
                                onClick={() => setBillingCycle('year')}
                                className={cn("rounded-full px-6 h-10 text-sm font-medium transition-all flex items-center gap-2", billingCycle === 'year' ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400")}
                            >
                                Annual <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded-full font-bold">-17%</span>
                            </button>
                        </div>
                    </div>
            
                    {/* Responsive Grid - 1 col mobile, 3 col desktop */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Free Tier */}
                        <div className={cn("bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border-2 transition-all", planKey === 'free' ? "border-gray-200 dark:border-gray-700 opacity-60" : "border-transparent opacity-100")}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Free Plan</h3>
                            {planKey === 'free' && <span className="text-xs bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full font-bold uppercase">Active</span>}
                        </div>
                        <p className="text-3xl font-bold mb-4">$0 <span className="text-sm font-normal text-gray-500">/ forever</span></p>
                        <ul className="space-y-3 mb-6">
                            {['Basic features', '1 Shared Link', 'Mobile App'].map(f => (
                                <li key={f} className="flex gap-2 text-sm"><Check size={16} /> {f}</li>
                            ))}
                        </ul>
                        </div>

                        {/* Couple Plan */}
                        <PlanCard 
                            title="Couple Plan"
                            price={plans.couple[billingCycle].price}
                            interval={billingCycle}
                            features={['Unlimited Packs', 'AI Assistant', 'Priority Support']}
                            icon={Heart}
                            gradient="from-[#FFB88C] to-[#FF8A8A]"
                            isActive={isCurrentInterval('couple', billingCycle)}
                            isCurrentTier={isCurrentPlanCard('couple')}
                            currentPlanKey={planKey}
                            targetPlanKey="couple"
                            isLoading={isLoading}
                            onAction={() => handleAction('couple', billingCycle)}
                            isPastDue={isPastDue}
                        />

                        {/* Family Plan */}
                        <PlanCard 
                            title="Family Plan"
                            price={plans.family[billingCycle].price}
                            interval={billingCycle}
                            features={['Up to 5 Members', 'Host Mode', 'Advanced Roles']}
                            icon={Crown}
                            gradient="from-[#5CA9E9] to-[#7BC47F]"
                            isActive={isCurrentInterval('family', billingCycle)}
                            isCurrentTier={isCurrentPlanCard('family')}
                            currentPlanKey={planKey}
                            targetPlanKey="family"
                            isLoading={isLoading}
                            onAction={() => handleAction('family', billingCycle)}
                            isPastDue={isPastDue}
                        />
                    </div>

                    {isPaidUser && (
                        <div className="mt-12 space-y-4 border-t border-gray-200 dark:border-gray-800 pt-8">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Subscription Management</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Button variant="outline" onClick={handleManageBilling} disabled={isManaging} className="w-full">
                                    {isManaging ? <Loader2 className="animate-spin mr-2" size={16} /> : <Shield className="mr-2" size={16} />}
                                    Billing Portal
                                </Button>
                                
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                                            Cancel Subscription
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Your plan will be canceled at the end of the current billing period. You will retain access until then.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Keep Plan</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleCancelSubscription} className="bg-red-500 hover:bg-red-600">
                                                {isManaging ? <Loader2 className="animate-spin" /> : "Yes, Cancel"}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

export default SubscriptionScreen;