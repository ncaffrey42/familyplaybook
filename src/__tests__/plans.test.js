import { describe, it, expect } from 'vitest';
import { getDowngradePlan, getUpgradePlan, PLAN_KEYS } from '../lib/plans.js';

describe('getDowngradePlan', () => {
  it('returns the next lower tier', () => {
    expect(getDowngradePlan(PLAN_KEYS.FAMILY)).toBe(PLAN_KEYS.COUPLE);
    expect(getDowngradePlan(PLAN_KEYS.COUPLE)).toBe(PLAN_KEYS.FREE);
  });

  it('returns null at the lowest tier', () => {
    expect(getDowngradePlan(PLAN_KEYS.FREE)).toBeNull();
  });

  it('returns null for an unknown plan key', () => {
    expect(getDowngradePlan('enterprise')).toBeNull();
  });

  it('is the inverse of getUpgradePlan across the ladder', () => {
    expect(getUpgradePlan(getDowngradePlan(PLAN_KEYS.FAMILY))).toBe(PLAN_KEYS.FAMILY);
    expect(getDowngradePlan(getUpgradePlan(PLAN_KEYS.FREE))).toBe(PLAN_KEYS.FREE);
  });
});
