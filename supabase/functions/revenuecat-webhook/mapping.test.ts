import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { billingUpdateFromEvent, planKeyFromEvent, productMapFromEnv } from './mapping.ts';

const productMap = {
  'fp_couple_monthly': 'couple',
  'fp_family_yearly': 'family',
};

Deno.test('INITIAL_PURCHASE with entitlement id → active plan', () => {
  const u = billingUpdateFromEvent(
    { type: 'INITIAL_PURCHASE', entitlement_ids: ['couple'], product_id: 'fp_couple_monthly', expiration_at_ms: 1893456000000 },
    productMap,
  );
  assertEquals(u?.plan_key, 'couple');
  assertEquals(u?.subscription_status, 'active');
  assertEquals(u?.billing_interval, 'month');
  assertEquals(u?.cancel_at_period_end, false);
  assertEquals(u?.billing_provider, 'revenuecat');
});

Deno.test('plan_key falls back to product-id map when entitlement is unknown', () => {
  assertEquals(
    planKeyFromEvent({ entitlement_ids: ['premium'], product_id: 'fp_family_yearly' }, productMap),
    'family',
  );
});

Deno.test('RENEWAL keeps plan active', () => {
  const u = billingUpdateFromEvent({ type: 'RENEWAL', entitlement_ids: ['family'], product_id: 'fp_family_yearly' }, productMap);
  assertEquals(u?.plan_key, 'family');
  assertEquals(u?.subscription_status, 'active');
  assertEquals(u?.billing_interval, 'year');
});

Deno.test('CANCELLATION keeps access, flags cancel_at_period_end', () => {
  const u = billingUpdateFromEvent({ type: 'CANCELLATION', entitlement_ids: ['couple'], product_id: 'fp_couple_monthly' }, productMap);
  assertEquals(u?.subscription_status, 'active');
  assertEquals(u?.cancel_at_period_end, true);
});

Deno.test('EXPIRATION drops to free/canceled', () => {
  const u = billingUpdateFromEvent({ type: 'EXPIRATION', entitlement_ids: ['couple'] }, productMap);
  assertEquals(u?.plan_key, 'free');
  assertEquals(u?.subscription_status, 'canceled');
});

Deno.test('BILLING_ISSUE → past_due, keeps plan', () => {
  const u = billingUpdateFromEvent({ type: 'BILLING_ISSUE', entitlement_ids: ['family'], product_id: 'fp_family_yearly' }, productMap);
  assertEquals(u?.plan_key, 'family');
  assertEquals(u?.subscription_status, 'past_due');
});

Deno.test('unmapped event type is ignored', () => {
  assertEquals(billingUpdateFromEvent({ type: 'TEST', entitlement_ids: ['couple'] }, productMap), null);
});

Deno.test('active event with no resolvable plan is ignored', () => {
  assertEquals(billingUpdateFromEvent({ type: 'INITIAL_PURCHASE', entitlement_ids: ['mystery'], product_id: 'unknown' }, productMap), null);
});

Deno.test('productMapFromEnv builds from env vars', () => {
  const env: Record<string, string> = {
    RC_PRODUCT_COUPLE_MONTH: 'fp_couple_monthly',
    RC_PRODUCT_FAMILY_YEAR: 'fp_family_yearly',
  };
  const map = productMapFromEnv((k) => env[k]);
  assertEquals(map['fp_couple_monthly'], 'couple');
  assertEquals(map['fp_family_yearly'], 'family');
});
