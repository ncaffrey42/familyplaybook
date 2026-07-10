import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { stripe, supabaseAdmin, requireUser, getOrCreateStripeCustomer, getPriceId } from '../_shared/stripe.ts';

// Subscription states that must block a new Checkout session. past_due is
// included: the fix for a failed payment is the Billing Portal, never a
// second subscription.
const BLOCKING_STATUSES = new Set(['active', 'trialing', 'past_due']);

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

    const customerId = await getOrCreateStripeCustomer(user.id, user.email!);

    // Guard: never open a second Checkout for a user who already has a live
    // subscription. We ask Stripe directly (not just user_billing) because the
    // DB can lag behind Stripe when webhooks are delayed or failing — exactly
    // the state that once produced a double subscription and a double charge.
    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });
    const liveSub = existing.data.find((s) => BLOCKING_STATUSES.has(s.status));
    if (liveSub) {
      return new Response(
        JSON.stringify({
          error: 'You already have an active subscription. Use the plan switcher to change tiers instead.',
          code: 'already_subscribed',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const priceId = getPriceId(plan_key, billing_interval);
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        // Metadata is inherited by the Subscription object and readable in webhooks
        metadata: { user_id: user.id, plan_key, billing_interval },
      },
      success_url: `${appUrl}/account/subscription?checkout=success`,
      cancel_url: `${appUrl}/account/subscription`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
