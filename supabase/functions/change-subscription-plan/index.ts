import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { stripe, supabaseAdmin, requireUser, getPriceId } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireUser(req);
    const { plan_key, billing_interval } = await req.json();

    if (!plan_key || !billing_interval) {
      return new Response(JSON.stringify({ error: 'plan_key and billing_interval are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: billing } = await supabaseAdmin
      .from('user_billing')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!billing?.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: 'No active subscription found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newPriceId = getPriceId(plan_key, billing_interval);
    const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    const currentItemId = subscription.items.data[0].id;

    // Prorate immediately on upgrade; use billing period end on downgrade
    const currentPlanLevel = { free: 0, couple: 1, family: 2 };
    const currentPlan = subscription.metadata?.plan_key ?? 'free';
    const isUpgrade = (currentPlanLevel[plan_key] ?? 0) > (currentPlanLevel[currentPlan] ?? 0);

    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      items: [{ id: currentItemId, price: newPriceId }],
      proration_behavior: isUpgrade ? 'create_prorations' : 'none',
      billing_cycle_anchor: isUpgrade ? 'now' : undefined,
      metadata: { user_id: user.id, plan_key, billing_interval },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[change-subscription-plan]', err);
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: err.message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
