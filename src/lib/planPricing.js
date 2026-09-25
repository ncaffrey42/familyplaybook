/**
 * Where the price a user sees comes from.
 *
 * On native, the store owns pricing. RevenueCat hands back a `priceString` per
 * product that is already localized, in the user's own currency, and formatted
 * the way that storefront expects ("$6.99", "£5.99", "6,99 €", "¥900"). It also
 * reflects whatever the price actually is after a tier change, which a constant
 * in the bundle cannot. Apple rejects a build that advertises a price it does
 * not charge, so the store string is authoritative wherever we have it.
 *
 * On web, Stripe charges the USD figures in plans.js, so those stay the source
 * of truth there — formatted through Intl rather than by gluing on a "$".
 *
 * The package matcher lives here, not in the purchase hook, so that the price
 * shown on a card and the package the button actually buys are chosen by the
 * same rule. Two copies of that rule would eventually disagree, and the way
 * you'd find out is a user charged a price the UI never showed.
 */
import { PLANS } from '@/lib/plans';

// Product ids encode the interval (e.g. "fp_couple_monthly",
// "fp_family_yearly") — see REVENUECAT_SETUP.md.
const YEAR_WORDS = /year|annual|yr/i;
const MONTH_WORDS = /month|mo\b/i;

/**
 * The store product id for a RevenueCat package. Falls back to the package
 * identifier, which is what the reserved-duration packages ($rc_monthly,
 * $rc_annual) are keyed by.
 */
export function packageProductId(pkg) {
  return pkg?.product?.identifier || pkg?.identifier || '';
}

/**
 * The package selling `planKey` on `interval`, or null.
 *
 * Matches the plan name and the interval against the product id. Anything
 * neither monthly nor yearly is not a match: `interval` is only ever 'month' or
 * 'year' here, and a product that reads as neither should not be silently sold
 * as one of them.
 */
export function matchPackage(packages, planKey, interval) {
  if (!Array.isArray(packages) || !planKey) return null;

  const wanted = interval === 'year' ? YEAR_WORDS : MONTH_WORDS;
  const found = packages.find((pkg) => {
    const id = packageProductId(pkg).toLowerCase();
    if (!id.includes(String(planKey).toLowerCase())) return false;
    return wanted.test(id);
  });

  return found ?? null;
}

/**
 * The store's own formatted price for a plan, or null when there is no matching
 * package (web, IAP off, offerings not loaded yet, or a product missing from the
 * dashboard).
 */
export function storePriceString(packages, planKey, interval) {
  const priceString = matchPackage(packages, planKey, interval)?.product?.priceString;
  return typeof priceString === 'string' && priceString.trim() !== '' ? priceString : null;
}

/** Format a USD amount the way a storefront would: 6.99 -> "$6.99". */
export function formatUsd(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * The price to render for a plan: the store's string when we have one, else the
 * plans.js USD figure. Returns '' rather than a wrong number if we have neither,
 * so a card never claims a price we cannot stand behind.
 *
 * Pass `packages: []` on web — the plans.js fallback is correct there.
 */
export function planPriceLabel({ planKey, interval, packages = [] }) {
  return (
    storePriceString(packages, planKey, interval) ??
    formatUsd(PLANS[planKey]?.price?.[interval]) ??
    ''
  );
}
