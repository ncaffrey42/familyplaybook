// Pure, unit-testable mapping from a RevenueCat webhook event to the
// user_billing fields we persist. No external deps so it can be tested with
// plain fixtures (see mapping.test.ts).

// RevenueCat event types we act on. Anything else is acknowledged and ignored.
// https://www.revenuecat.com/docs/webhooks/event-types-and-fields
const ACTIVE_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);
const ENDED_TYPES = new Set(['EXPIRATION']);
// CANCELLATION = auto-renew turned off but access continues until expiry, so we
// keep the plan active and just flag cancel_at_period_end.
// BILLING_ISSUE = grace period; keep access, mark past_due.

/** Resolve the plan_key for an event. Preference:
 *  1. an entitlement id that is already one of our plan keys (couple|family)
 *  2. a product-id → plan_key map supplied by the caller (from env)
 *  3. null (caller decides fallback)
 */
export function planKeyFromEvent(
  event: Record<string, unknown>,
  productMap: Record<string, string>,
): string | null {
  const PLAN_KEYS = new Set(['free', 'couple', 'family']);

  const entIds = (event.entitlement_ids as string[] | undefined) ?? [];
  for (const e of entIds) {
    if (PLAN_KEYS.has(e)) return e;
  }
  // Legacy single-entitlement field
  const entId = event.entitlement_id as string | undefined;
  if (entId && PLAN_KEYS.has(entId)) return entId;

  const productId = event.product_id as string | undefined;
  if (productId && productMap[productId]) return productMap[productId];

  return null;
}

/** Interval from the RC product/period, best-effort. */
export function intervalFromEvent(event: Record<string, unknown>): string | null {
  const p = (event.period_type as string | undefined)?.toLowerCase();
  if (p === 'trial') return null;
  const product = (event.product_id as string | undefined) ?? '';
  if (/year|annual|yr/i.test(product)) return 'year';
  if (/month|mo\b/i.test(product)) return 'month';
  return null;
}

export interface BillingUpdate {
  plan_key: string;
  subscription_status: string;
  billing_interval: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  billing_provider: 'revenuecat';
  price_id: string | null;
}

/**
 * Compute the user_billing update for an event, or null if the event type is
 * one we deliberately ignore. `productMap` maps store product ids → plan_key.
 */
export function billingUpdateFromEvent(
  event: Record<string, unknown>,
  productMap: Record<string, string>,
): BillingUpdate | null {
  const type = event.type as string;
  const expirationMs = event.expiration_at_ms as number | undefined;
  const periodEnd = expirationMs ? new Date(expirationMs).toISOString() : null;

  if (ENDED_TYPES.has(type)) {
    // Subscription lapsed → back to free.
    return {
      plan_key: 'free',
      subscription_status: 'canceled',
      billing_interval: null,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      billing_provider: 'revenuecat',
      price_id: null,
    };
  }

  if (type === 'CANCELLATION') {
    const planKey = planKeyFromEvent(event, productMap);
    if (!planKey) return null;
    // Access continues until period end; auto-renew is off.
    return {
      plan_key: planKey,
      subscription_status: 'active',
      billing_interval: intervalFromEvent(event),
      current_period_end: periodEnd,
      cancel_at_period_end: true,
      billing_provider: 'revenuecat',
      price_id: (event.product_id as string | undefined) ?? null,
    };
  }

  if (type === 'BILLING_ISSUE') {
    const planKey = planKeyFromEvent(event, productMap);
    if (!planKey) return null;
    return {
      plan_key: planKey,
      subscription_status: 'past_due',
      billing_interval: intervalFromEvent(event),
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      billing_provider: 'revenuecat',
      price_id: (event.product_id as string | undefined) ?? null,
    };
  }

  if (ACTIVE_TYPES.has(type)) {
    const planKey = planKeyFromEvent(event, productMap);
    if (!planKey) return null;
    return {
      plan_key: planKey,
      subscription_status: 'active',
      billing_interval: intervalFromEvent(event),
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      billing_provider: 'revenuecat',
      price_id: (event.product_id as string | undefined) ?? null,
    };
  }

  return null; // TRANSFER, SUBSCRIPTION_PAUSED, TEST, etc. — acknowledged, ignored
}

/** Build the product-id → plan_key map from env vars (mirrors Stripe's). */
export function productMapFromEnv(get: (k: string) => string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [plan, keys] of [
    ['couple', ['RC_PRODUCT_COUPLE_MONTH', 'RC_PRODUCT_COUPLE_YEAR']],
    ['family', ['RC_PRODUCT_FAMILY_MONTH', 'RC_PRODUCT_FAMILY_YEAR']],
  ] as const) {
    for (const k of keys) {
      const v = get(k);
      if (v) map[v] = plan;
    }
  }
  return map;
}
