import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { AnalyticsService } from '@/lib/AnalyticsService';
import { useToast } from '@/components/ui/use-toast';

export const useSubscription = () => {
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { toast } = useToast();

    const fetchSubscription = useCallback(async () => {
        try {
            const { data, error } = await supabase.functions.invoke('get-subscription');
            if (error) throw error;
            setSubscription(data);
            return data;
        } catch (err) {
            console.error('Fetch subscription error:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const pollSubscription = async (maxAttempts = 15, interval = 2000) => {
        let attempts = 0;
        
        const check = async () => {
            attempts++;
            const data = await fetchSubscription();
            
            // Basic check: if we have a status change or specific logic, we stop.
            // For now, we just refresh data. The caller might want to check data.status.
            // But realistically, polling is usually done to wait for a *new* state.
            // Since this function just refreshes, let's assume successful fetch is enough for now,
            // or we could pass a predicate function.
            
            if (attempts < maxAttempts) {
                setTimeout(check, interval);
            }
        };
        
        // Start polling
        setTimeout(check, interval);
    };

    const createCheckoutSession = async (planId, interval = 'month') => {
        setLoading(true);
        AnalyticsService.track('checkout_started', { planId, interval });
        try {
            const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                body: { plan_id: planId, interval }
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

    const downgradeSubscription = async (toPlanId) => {
        setLoading(true);
        AnalyticsService.track('downgrade_started', { toPlanId });
        try {
            const { data, error } = await supabase.functions.invoke('downgrade-subscription', {
                body: { to_plan_id: toPlanId }
            });
            if (error) throw error;
            
            AnalyticsService.track('downgrade_completed', { toPlanId });
            await fetchSubscription(); // Refresh
            return data;
        } catch (err) {
            console.error('Downgrade error:', err);
            toast({ title: "Downgrade Failed", description: err.message, variant: "destructive" });
            throw err;
        } finally {
            setLoading(false);
        }
    };

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
        pollSubscription
    };
};