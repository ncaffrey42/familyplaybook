// Tests for change-subscription-plan request validation + tier routing.
//
// index.ts imports ../_shared/stripe.ts, which constructs the Stripe/Supabase
// clients at module load from env vars. They're unused here but must construct,
// so run with dummy values:
//
//   STRIPE_SECRET_KEY=sk_test_dummy \
//   SUPABASE_URL=http://localhost:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=dummy \
//   deno test --no-check --allow-env --allow-net supabase/functions/change-subscription-plan/index.test.ts
//
import { assertEquals } from 'jsr:@std/assert@1';
import { isValidPlanKey, validateChangeRequest, classifyPlanChange } from './index.ts';
import { planFromSubscriptionPrice } from '../_shared/stripe.ts';

// Build a minimal subscription whose live price + (optionally stale) metadata
// can disagree, so we can prove routing uses the price.
function fakeSubscription(opts: { priceId: string; metadataPlanKey?: string }) {
  return {
    metadata: opts.metadataPlanKey ? { plan_key: opts.metadataPlanKey } : {},
    items: { data: [{ price: { id: opts.priceId } } ] },
  } as never;
}

// ── Validation ────────────────────────────────────────────────────────────────

Deno.test('isValidPlanKey accepts the known set and rejects everything else', () => {
  for (const k of ['free', 'couple', 'family']) assertEquals(isValidPlanKey(k), true);
  for (const k of ['', 'enterprise', 'Couple', 'FAMILY', undefined, null, 7]) {
    assertEquals(isValidPlanKey(k), false);
  }
});

Deno.test('validateChangeRequest rejects missing fields', () => {
  assertEquals(validateChangeRequest({}).ok, false);
  assertEquals(validateChangeRequest({ plan_key: 'couple' }).ok, false);
  assertEquals(validateChangeRequest({ billing_interval: 'month' }).ok, false);
});

Deno.test('validateChangeRequest rejects an invalid plan_key', () => {
  const res = validateChangeRequest({ plan_key: 'enterprise', billing_interval: 'month' });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error, 'Invalid plan_key: enterprise');
});

Deno.test('validateChangeRequest rejects an invalid billing_interval', () => {
  const res = validateChangeRequest({ plan_key: 'couple', billing_interval: 'weekly' });
  assertEquals(res.ok, false);
});

Deno.test('validateChangeRequest accepts a well-formed request', () => {
  const res = validateChangeRequest({ plan_key: 'family', billing_interval: 'year' });
  assertEquals(res, { ok: true, planKey: 'family', interval: 'year' });
});

// ── Routing from the live price (not metadata) ─────────────────────────────────

Deno.test('routing derives the current plan from the live price, ignoring stale metadata', () => {
  Deno.env.set('STRIPE_PRICE_COUPLE_MONTH', 'price_couple_m');

  // Live price = couple, but metadata still says family (stale upgrade hint).
  const sub = fakeSubscription({ priceId: 'price_couple_m', metadataPlanKey: 'family' });
  const currentPlan = planFromSubscriptionPrice(sub)?.planKey ?? 'free';
  assertEquals(currentPlan, 'couple');

  // Target family → must be an UPGRADE (couple→family). Trusting the stale
  // metadata (family) would have wrongly classified this as 'lateral'.
  assertEquals(classifyPlanChange(currentPlan, 'family'), 'upgrade');
});

Deno.test('routing classifies a downgrade from the live price', () => {
  Deno.env.set('STRIPE_PRICE_FAMILY_MONTH', 'price_family_m');

  const sub = fakeSubscription({ priceId: 'price_family_m', metadataPlanKey: 'couple' });
  const currentPlan = planFromSubscriptionPrice(sub)?.planKey ?? 'free';
  assertEquals(currentPlan, 'family');
  assertEquals(classifyPlanChange(currentPlan, 'couple'), 'downgrade');
  assertEquals(classifyPlanChange(currentPlan, 'free'), 'downgrade');
});

Deno.test('classifyPlanChange treats same-tier (interval switch) as lateral', () => {
  assertEquals(classifyPlanChange('couple', 'couple'), 'lateral');
});

Deno.test('planFromSubscriptionPrice returns null for an unmapped price (caller falls back)', () => {
  const sub = fakeSubscription({ priceId: 'price_not_in_env', metadataPlanKey: 'couple' });
  assertEquals(planFromSubscriptionPrice(sub), null);
});
