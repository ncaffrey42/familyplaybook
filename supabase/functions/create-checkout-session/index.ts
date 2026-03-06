import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { stripe, supabaseAdmin, requireUser, getOrCreateStripeCustomer, getPriceId } from '../_shared/stripe.ts';

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
      success_url: `${appUrl}/subscription?checkout=success`,
      cancel_url: `${appUrl}/subscription`,
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
