import { supabase } from '@/lib/customSupabaseClient';

/**
 * API Client for higher-level data fetching and backend interactions.
 */
export const apiClient = {
  
  /**
   * Fetches current plan details and usage metrics for the user.
   * Now uses the Edge Function 'get-subscription' which aggregates data.
   */
  getUserPlan: async (userId) => {
    // Legacy support or fallback if needed, but primary logic is via edge function now
    // for consistency with the rest of the application.
    // However, MyAccountPlanSection in some versions might still use this directly.
    // Let's proxy to the edge function.
    const { data, error } = await supabase.functions.invoke('get-subscription');
    if (error) throw error;
    
    // Transform edge function response to match legacy structure if needed,
    // or consumer components should be updated to use hook.
    // MyAccountPlanSection updated to use hook, but generic usage might rely on this.
    return {
        plan: { name: data.plan_name },
        usage: data.usage,
        limits: data.entitlements.reduce((acc, curr) => {
            acc[curr.feature_key] = {
                value: curr.feature_value_int,
                textValue: curr.feature_value_text,
                isUnlimited: curr.is_unlimited
            };
            return acc;
        }, {})
    };
  },

  /**
   * Fetches all available plans and their entitlements.
   */
  getPlans: async () => {
    try {
      const { data: plans, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (plansError) throw plansError;

      const plansWithEntitlements = await Promise.all(plans.map(async (plan) => {
        const { data: entitlements } = await supabase
          .from('plan_entitlements')
          .select('*')
          .eq('plan_id', plan.id);
          
        return {
          ...plan,
          entitlements: entitlements || []
        };
      }));

      return plansWithEntitlements;
    } catch (error) {
      console.error('getPlans failed:', error);
      throw error;
    }
  },

  /**
   * Initiates a Stripe Checkout Session via Edge Function.
   */
  createCheckoutSession: async (planId, interval = 'month') => {
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { plan_id: planId, interval }
      });

      if (error) throw error;
      return data; // { url: string }
    } catch (error) {
      console.error('createCheckoutSession failed:', error);
      throw error;
    }
  }
};