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
  const { data: billing } = await supabaseAdmin
    .from('user_billing')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (billing?.stripe_customer_id) return billing.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });

  await supabaseAdmin
    .from('user_billing')
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: 'user_id' });

  return customer.id;
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
