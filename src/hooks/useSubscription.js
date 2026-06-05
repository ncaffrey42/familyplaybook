import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { PLANS } from '@/lib/plans';
import { AnalyticsService } from '@/services/AnalyticsService';
import { useToast } from '@/components/ui/use-toast';

export const useSubscription = () => {
    const { user, planKey, subscriptionStatus, currentPeriodEnd, cancelAtPeriodEnd, billingInterval, scheduledPlanKey, scheduledChangeAt } = useAuth();
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { toast } = useToast();

    // Build subscription object from auth context + live usage/entitlements from DB
    const fetchSubscription = useCallback(async () => {
        if (!user) {
            setSubscription(null);
            setLoading(false);
            return null;
        }

        try {
            setLoading(true);

            const planDisplayName = PLANS[planKey]?.displayName || 'Free';

            // Look up plan UUID by the stable plan_key (not display name) so we
            // can query plan_entitlements.
            const { data: planRecord } = await supabase
                .from('plans')
                .select('id')
                .eq('plan_key', planKey || 'free')
                .single();

            const [entitlementsRes, usageRes] = await Promise.all([
                planRecord
                    ? supabase.from('plan_entitlements').select('*').eq('plan_id', planRecord.id)
                    : Promise.resolve({ data: [] }),
                supabase.from('user_usage').select('*').eq('user_id', user.id),
            ]);

            const usageMap = {};
            (usageRes.data || []).forEach(u => {
                usageMap[u.feature_key] = u.current_usage;
            });

            const data = {
                plan_name: planDisplayName,
                status: subscriptionStatus || 'free',
                current_period_end: currentPeriodEnd,
                cancel_at_period_end: cancelAtPeriodEnd,
                scheduled_plan_key: scheduledPlanKey || null,
                scheduled_change_at: scheduledChangeAt || null,
                entitlements: entitlementsRes.data || [],
                usage: usageMap,
            };

            setSubscription(data);
            return data;
        } catch (err) {
            console.error('Fetch subscription error:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [user, planKey, subscriptionStatus, currentPeriodEnd, cancelAtPeriodEnd, scheduledPlanKey, scheduledChangeAt]);

    const createCheckoutSession = async (planKey, billingInterval = 'month') => {
        setLoading(true);
        AnalyticsService.track('checkout_started', { planKey, billingInterval });
        try {
            const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                body: { plan_key: planKey, billing_interval: billingInterval }
            });
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('Checkout creation error:', err);
            toast({ title: "Checkout Error", description: err.message, variant: "destructive" });
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const downgradeSubscription = async (toPlanKey) => {
        setLoading(true);
        AnalyticsService.track('downgrade_started', { toPlanKey });
        try {
            const { data, error } = await supabase.functions.invoke('change-subscription-plan', {
                body: { plan_key: toPlanKey, billing_interval: billingInterval || 'month' }
            });
            if (error) throw error;
            if (data && data.success === false) throw new Error(data.error || 'Downgrade failed');

            AnalyticsService.track('downgrade_completed', { toPlanKey });

            // Downgrades apply at the end of the current billing period. Confirm
            // that to the user rather than implying an immediate change.
            const when = data?.effective_date
                ? new Date(data.effective_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : null;
            toast({
                title: 'Downgrade scheduled',
                description: when
                    ? `You'll keep your current plan until ${when}, then switch to ${PLANS[toPlanKey]?.displayName || toPlanKey}.`
                    : `Your plan will switch to ${PLANS[toPlanKey]?.displayName || toPlanKey} at the end of your billing period.`,
                variant: 'success',
            });

            await fetchSubscription();
            return data;
        } catch (err) {
            console.error('Downgrade error:', err);
            toast({ title: "Downgrade Failed", description: err.message, variant: "destructive" });
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch whenever auth context billing state changes
    useEffect(() => {
        fetchSubscription();
    }, [fetchSubscription]);

    return {
        subscription,
        loading,
        error,
        fetchSubscription,
        createCheckoutSession,
        downgradeSubscription,
    };
};
