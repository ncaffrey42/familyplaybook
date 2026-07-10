import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { stripe, supabaseAdmin, requireUser } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireUser(req);

    const { data: billing } = await supabaseAdmin
      .from('user_billing')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!billing?.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: 'No active subscription found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // A pending downgrade leaves a subscription schedule attached, and Stripe
    // refuses cancel_at_period_end while a schedule manages the subscription —
    // release it first (the cancellation supersedes the scheduled downgrade).
    const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    if (subscription.schedule) {
      await stripe.subscriptionSchedules.release(subscription.schedule as string);
    }

    // Cancel at period end — user retains access until the period expires
    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cancel-subscription]', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
