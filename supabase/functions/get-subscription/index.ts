import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { supabaseAdmin, requireUser } from '../_shared/stripe.ts';

const FREE_PLAN_DEFAULT = {
  plan_key: 'free',
  subscription_status: 'free',
  billing_interval: null,
  current_period_end: null,
  scheduled_plan_key: null,
  scheduled_change_at: null,
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireUser(req);

    const { data: billing, error } = await supabaseAdmin
      .from('user_billing')
      .select('plan_key, subscription_status, billing_interval, current_period_end, scheduled_plan_key, scheduled_change_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[get-subscription] DB error:', error);
      throw new Error(error.message);
    }

    // No billing row means a new user who has never subscribed — return free plan defaults
    if (!billing) {
      return new Response(JSON.stringify(FREE_PLAN_DEFAULT), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      plan_key: billing.plan_key ?? 'free',
      subscription_status: billing.subscription_status ?? 'free',
      billing_interval: billing.billing_interval ?? null,
      current_period_end: billing.current_period_end ?? null,
      scheduled_plan_key: billing.scheduled_plan_key ?? null,
      scheduled_change_at: billing.scheduled_change_at ?? null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[get-subscription]', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
