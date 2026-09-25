import { describe, it, expect } from 'vitest';
import {
  formatUsd,
  matchPackage,
  packageProductId,
  planPriceLabel,
  storePriceString,
} from '@/lib/planPricing';

/** A RevenueCat package as the SDK returns it. */
const pkg = (identifier, priceString, price) => ({
  identifier: '$rc_monthly',
  product: { identifier, priceString, price },
});

// The dashboard shape: one offering per tier, so both tiers' monthly and annual
// products come back flattened together (see useNativePurchases.getPackages).
const STORE = [
  pkg('fp_couple_monthly', '$6.99', 6.99),
  pkg('fp_couple_yearly', '$69.90', 69.9),
  pkg('fp_family_monthly', '$13.99', 13.99),
  pkg('fp_family_yearly', '$139.90', 139.9),
];

describe('packageProductId', () => {
  it('prefers the product identifier', () => {
    expect(packageProductId(pkg('fp_couple_monthly', '$6.99'))).toBe('fp_couple_monthly');
  });

  it('falls back to the package identifier', () => {
    expect(packageProductId({ identifier: '$rc_annual' })).toBe('$rc_annual');
  });

  it('is safe on nothing', () => {
    expect(packageProductId(null)).toBe('');
    expect(packageProductId({})).toBe('');
  });
});

describe('matchPackage', () => {
  it('picks the right plan and interval', () => {
    expect(packageProductId(matchPackage(STORE, 'couple', 'month'))).toBe('fp_couple_monthly');
    expect(packageProductId(matchPackage(STORE, 'couple', 'year'))).toBe('fp_couple_yearly');
    expect(packageProductId(matchPackage(STORE, 'family', 'month'))).toBe('fp_family_monthly');
    expect(packageProductId(matchPackage(STORE, 'family', 'year'))).toBe('fp_family_yearly');
  });

  it('does not confuse monthly with yearly', () => {
    // The bug this guards: "monthly" must not satisfy a yearly lookup, and
    // "yearly" must not satisfy a monthly one.
    const yearlyOnly = [pkg('fp_couple_yearly', '$69.90')];
    expect(matchPackage(yearlyOnly, 'couple', 'month')).toBeNull();

    const monthlyOnly = [pkg('fp_couple_monthly', '$6.99')];
    expect(matchPackage(monthlyOnly, 'couple', 'year')).toBeNull();
  });

  it('accepts the alternate interval spellings', () => {
    expect(packageProductId(matchPackage([pkg('fp_couple_annual', 'x')], 'couple', 'year')))
      .toBe('fp_couple_annual');
    expect(packageProductId(matchPackage([pkg('fp_couple_1yr', 'x')], 'couple', 'year')))
      .toBe('fp_couple_1yr');
    expect(packageProductId(matchPackage([pkg('fp_couple_mo', 'x')], 'couple', 'month')))
      .toBe('fp_couple_mo');
  });

  it('returns null for an unknown plan', () => {
    expect(matchPackage(STORE, 'enterprise', 'month')).toBeNull();
  });

  it('is case-insensitive on the plan key', () => {
    expect(packageProductId(matchPackage([pkg('FP_COUPLE_MONTHLY', 'x')], 'couple', 'month')))
      .toBe('FP_COUPLE_MONTHLY');
  });

  it('is safe on missing or malformed input', () => {
    expect(matchPackage(null, 'couple', 'month')).toBeNull();
    expect(matchPackage(undefined, 'couple', 'month')).toBeNull();
    expect(matchPackage(STORE, null, 'month')).toBeNull();
    expect(matchPackage([null, undefined, {}], 'couple', 'month')).toBeNull();
  });
});

describe('storePriceString', () => {
  it('returns the store-formatted price', () => {
    expect(storePriceString(STORE, 'couple', 'month')).toBe('$6.99');
    expect(storePriceString(STORE, 'family', 'year')).toBe('$139.90');
  });

  it('passes through a non-USD storefront string untouched', () => {
    const uk = [pkg('fp_couple_monthly', '£5.99', 5.99)];
    expect(storePriceString(uk, 'couple', 'month')).toBe('£5.99');

    const de = [pkg('fp_family_yearly', '139,90 €', 139.9)];
    expect(storePriceString(de, 'family', 'year')).toBe('139,90 €');
  });

  it('returns null when there is no matching package', () => {
    expect(storePriceString([], 'couple', 'month')).toBeNull();
    expect(storePriceString(STORE, 'enterprise', 'month')).toBeNull();
  });

  it('returns null for a package with no usable price string', () => {
    expect(storePriceString([pkg('fp_couple_monthly', undefined)], 'couple', 'month')).toBeNull();
    expect(storePriceString([pkg('fp_couple_monthly', '')], 'couple', 'month')).toBeNull();
    expect(storePriceString([pkg('fp_couple_monthly', '   ')], 'couple', 'month')).toBeNull();
  });
});

describe('formatUsd', () => {
  it('formats the plans.js figures the way the old hardcoded strings read', () => {
    expect(formatUsd(6.99)).toBe('$6.99');
    expect(formatUsd(69.9)).toBe('$69.90');
    expect(formatUsd(13.99)).toBe('$13.99');
    expect(formatUsd(139.9)).toBe('$139.90');
  });

  it('formats zero', () => {
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('returns null on anything that is not a finite number', () => {
    expect(formatUsd(undefined)).toBeNull();
    expect(formatUsd(null)).toBeNull();
    expect(formatUsd('6.99')).toBeNull();
    expect(formatUsd(NaN)).toBeNull();
    expect(formatUsd(Infinity)).toBeNull();
  });
});

describe('planPriceLabel', () => {
  it('prefers the store price when a package is available', () => {
    const uk = [pkg('fp_couple_monthly', '£5.99', 5.99)];
    expect(planPriceLabel({ planKey: 'couple', interval: 'month', packages: uk })).toBe('£5.99');
  });

  it('falls back to the plans.js USD figure with no packages (the web case)', () => {
    expect(planPriceLabel({ planKey: 'couple', interval: 'month', packages: [] })).toBe('$6.99');
    expect(planPriceLabel({ planKey: 'couple', interval: 'year', packages: [] })).toBe('$69.90');
    expect(planPriceLabel({ planKey: 'family', interval: 'month', packages: [] })).toBe('$13.99');
    expect(planPriceLabel({ planKey: 'family', interval: 'year', packages: [] })).toBe('$139.90');
  });

  it('defaults packages to empty, so a caller that has none still gets the fallback', () => {
    expect(planPriceLabel({ planKey: 'family', interval: 'month' })).toBe('$13.99');
  });

  it('falls back per-interval: a store monthly price does not mask a missing annual', () => {
    const partial = [pkg('fp_couple_monthly', '£5.99', 5.99)];
    expect(planPriceLabel({ planKey: 'couple', interval: 'month', packages: partial })).toBe('£5.99');
    // No annual product in the dashboard yet — show the known USD figure, not nothing.
    expect(planPriceLabel({ planKey: 'couple', interval: 'year', packages: partial })).toBe('$69.90');
  });

  it('returns empty string rather than a wrong price for an unknown plan', () => {
    expect(planPriceLabel({ planKey: 'enterprise', interval: 'month', packages: [] })).toBe('');
  });
});
