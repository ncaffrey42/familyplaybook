import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { inferPlanFromPriceId } from '../_shared/stripe.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveUserId(customerId: string): Promise<string | null> {
  // 1. Check our own user_billing table first (fastest path)
  const { data } = await supabaseAdmin
    .from('user_billing')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (data?.user_id) return data.user_id;

  // 2. Fall back to Stripe customer metadata (set during customer creation)
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return (customer as Stripe.Customer).metadata?.user_id ?? null;
}

function getSubscriptionBillingData(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const interval = item?.price?.recurring?.interval ?? null;

  // 1. Prefer metadata set at checkout (most reliable)
  let planKey = sub.metadata?.plan_key ?? null;
  let billingInterval = sub.metadata?.billing_interval ?? interval;

  // 2. Fall back to env-var price map
  if (!planKey && priceId) {
    const inferred = inferPlanFromPriceId(priceId);
    if (inferred) {
      planKey = inferred.planKey;
      billingInterval = inferred.interval;
    }
  }

  // 3. Last resort: leave as null (UI will show 'free' gracefully)
  return {
    subscription_status: sub.status,                          // active | trialing | past_due | canceled | …
    plan_key: planKey ?? 'free',
    price_id: priceId,
    billing_interval: billingInterval,
    stripe_subscription_id: sub.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}

async function upsertBilling(userId: string, billingData: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from('user_billing')
    .upsert({ user_id: userId, ...billingData }, { onConflict: 'user_id' });

  if (error) throw new Error(`DB upsert failed: ${error.message}`);
}

// ── Event Handlers ────────────────────────────────────────────────────────────

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const userId = await resolveUserId(sub.customer as string);
  if (!userId) {
    console.warn('[stripe-webhook] Could not resolve user_id for customer:', sub.customer);
    return;
  }
  await upsertBilling(userId, getSubscriptionBillingData(sub));
  console.log(`[stripe-webhook] Billing updated for user ${userId} — status: ${sub.status}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = await resolveUserId(sub.customer as string);
  if (!userId) return;
  await upsertBilling(userId, {
    subscription_status: 'canceled',
    plan_key: 'free',
    stripe_subscription_id: sub.id,
    cancel_at_period_end: false,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
  });
  console.log(`[stripe-webhook] Subscription deleted for user ${userId}`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;
  const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
  await handleSubscriptionUpsert(sub);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;
  const userId = await resolveUserId(invoice.customer as string);
  if (!userId) return;
  // Mark as past_due; do NOT downgrade plan — give them time to fix payment
  await supabaseAdmin
    .from('user_billing')
    .update({ subscription_status: 'past_due' })
    .eq('user_id', userId);
  console.log(`[stripe-webhook] Payment failed for user ${userId}`);
}

// ── Main Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');

  if (!sig || !webhookSecret) {
    return new Response('Missing signature or secret', { status: 400 });
  }

  // Raw body is required for signature verification — do NOT call req.json() here
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return new Response(`Webhook signature invalid: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Acknowledge unhandled events so Stripe doesn't retry them
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err);
    // Return 500 so Stripe retries — transient failures should not be silently dropped
    return new Response(`Handler error: ${err.message}`, { status: 500 });
  }
});
