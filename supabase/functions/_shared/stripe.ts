import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

/** Admin Supabase client — bypasses RLS. Only for use inside edge functions. */
export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/**
 * Verify the incoming request's Supabase JWT and return the authenticated user.
 * Throws if the token is missing or invalid.
 */
export async function requireUser(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) throw new Error('Missing Authorization header');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

/**
 * Resolve or create a Stripe customer for the given Supabase user.
 * Stores the customer ID in user_billing so we don't create duplicates.
 */
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  // 1. Check if we already have a billing row
  const { data: billing } = await supabaseAdmin
    .from('user_billing')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (billing?.stripe_customer_id) return billing.stripe_customer_id;

  // 2. Check if a Stripe customer already exists for this email (from older code)
  const existing = await stripe.customers.list({ email, limit: 1 });
  let customerId: string;

  if (existing.data.length > 0) {
    customerId = existing.data[0].id;
    // Ensure metadata has user_id for webhook resolution
    await stripe.customers.update(customerId, {
      metadata: { user_id: userId, supabase_user_id: userId },
    });
  } else {
    const customer = await stripe.customers.create({
      email,
      metadata: { user_id: userId, supabase_user_id: userId },
    });
    customerId = customer.id;
  }

  // 3. Upsert billing row with defaults for all columns to avoid NOT NULL failures
  const { error } = await supabaseAdmin
    .from('user_billing')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      plan_key: 'free',
      subscription_status: 'free',
      cancel_at_period_end: false,
    }, { onConflict: 'user_id' });

  if (error) console.error('[getOrCreateStripeCustomer] upsert failed:', error);

  return customerId;
}

/**
 * Map plan_key + billing_interval → Stripe price ID using env vars.
 * Set these in Supabase Function secrets:
 *   STRIPE_PRICE_COUPLE_MONTH, STRIPE_PRICE_COUPLE_YEAR
 *   STRIPE_PRICE_FAMILY_MONTH, STRIPE_PRICE_FAMILY_YEAR
 */
export function getPriceId(planKey: string, interval: string): string {
  const key = `STRIPE_PRICE_${planKey.toUpperCase()}_${interval.toUpperCase()}`;
  const priceId = Deno.env.get(key);
  if (!priceId) throw new Error(`Missing env var: ${key}`);
  return priceId;
}

/**
 * Infer plan_key from a price ID by checking each known env-var mapping.
 */
export function inferPlanFromPriceId(priceId: string): { planKey: string; interval: string } | null {
  const pairs = [
    ['couple', 'month'],
    ['couple', 'year'],
    ['family', 'month'],
    ['family', 'year'],
  ];
  for (const [planKey, interval] of pairs) {
    const key = `STRIPE_PRICE_${planKey.toUpperCase()}_${interval.toUpperCase()}`;
    if (Deno.env.get(key) === priceId) return { planKey, interval };
  }
  return null;
}

/**
 * Source-of-truth precedence for a subscription's CURRENT plan, shared by
 * stripe-webhook (reconciling billing state) and change-subscription-plan
 * (routing upgrade vs downgrade):
 *
 *   1. The live Stripe price on the subscription — what the customer is actually
 *      billed for right now. This is the ONLY signal that stays correct for plan
 *      changes made through the Stripe Billing Portal, which never write our app
 *      metadata. Treat it as authoritative for the current plan.
 *   2. (caller-supplied fallback) subscription.metadata.plan_key or our stored
 *      user_billing.plan_key — only a HINT of intended state, written by our own
 *      checkout / change-plan flows. Use ONLY when the live price isn't in our
 *      env map (e.g. a legacy or unmapped price).
 *   3. (caller-supplied fallback) 'free' — last resort.
 *
 * This helper implements step 1: it returns the plan inferred from the live
 * price, or null when the price isn't recognised, leaving the fallback to the
 * caller — their fallback source differs (the webhook has event metadata, the
 * change-plan function has the DB billing row).
 */
export function planFromSubscriptionPrice(
  sub: Stripe.Subscription,
): { planKey: string; interval: string } | null {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  return priceId ? inferPlanFromPriceId(priceId) : null;
}
