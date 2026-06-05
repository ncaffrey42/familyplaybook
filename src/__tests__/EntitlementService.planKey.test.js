import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory Supabase fake. Crucially, the plans' display names are renamed to
// strings that INITCAP(plan_key) / a displayName lookup would NEVER produce —
// proving entitlement resolution keys off the stable plan_key, not the name.
const { client, recorded } = vi.hoisted(() => {
  const recorded = [];
  const DATA = {
    user_billing: [{ user_id: 'u1', plan_key: 'couple', subscription_status: 'active' }],
    plans: [
      { id: 'plan-couple', plan_key: 'couple', name: 'Couples & Partners ✨' },
      { id: 'plan-family', plan_key: 'family', name: 'The Whole Family' },
    ],
    plan_entitlements: [
      { plan_id: 'plan-couple', feature_key: 'active_guides_max', feature_value_int: 25, feature_value_text: null, is_unlimited: false },
      { plan_id: 'plan-couple', feature_key: 'bundles_max', feature_value_int: 10, feature_value_text: null, is_unlimited: false },
      { plan_id: 'plan-couple', feature_key: 'storage_bytes_max', feature_value_int: 500, feature_value_text: null, is_unlimited: false },
      { plan_id: 'plan-couple', feature_key: 'editors_max', feature_value_int: 1, feature_value_text: null, is_unlimited: false },
      { plan_id: 'plan-family', feature_key: 'active_guides_max', feature_value_int: null, feature_value_text: null, is_unlimited: true },
      { plan_id: 'plan-family', feature_key: 'bundles_max', feature_value_int: null, feature_value_text: null, is_unlimited: true },
    ],
    user_usage: [{ user_id: 'u1', feature_key: 'active_guides', current_usage: 30 }],
  };

  function builder(table) {
    const filters = [];
    const api = {
      select() { return api; },
      eq(col, val) { filters.push([col, val]); recorded.push({ table, col, val }); return api; },
      _rows() { return (DATA[table] || []).filter(r => filters.every(([c, v]) => r[c] === v)); },
      maybeSingle() { return Promise.resolve({ data: api._rows()[0] ?? null, error: null }); },
      single() {
        const r = api._rows()[0] ?? null;
        return Promise.resolve({ data: r, error: r ? null : { message: 'no rows' } });
      },
      then(resolve) { resolve({ data: api._rows(), error: null }); },
    };
    return api;
  }

  return { client: { from: (t) => builder(t) }, recorded };
});

vi.mock('@/lib/supabaseClient', () => ({ supabase: client }));

const { EntitlementService } = await import('../services/EntitlementService.js');

describe('EntitlementService plan lookup by plan_key', () => {
  beforeEach(() => { recorded.length = 0; });

  it('resolves the current user limits via plan_key even when the display name is renamed', async () => {
    const limits = await new EntitlementService().getPlanLimits('u1');
    expect(limits).toEqual({ active_guides: 25, bundles: 10, storage_bytes: 500, editors: 1 });
  });

  it('looks plans up by plan_key, never by display name', async () => {
    await new EntitlementService().getPlanLimits('u1');
    const planFilters = recorded.filter(r => r.table === 'plans');
    expect(planFilters.some(f => f.col === 'plan_key')).toBe(true);
    expect(planFilters.some(f => f.col === 'name')).toBe(false);
  });

  it('getPlanLimitsByKey resolves an arbitrary plan and reports unlimited as null', async () => {
    const limits = await new EntitlementService().getPlanLimitsByKey('family');
    expect(limits).toEqual({ active_guides: null, bundles: null, storage_bytes: null, editors: null });
  });
});
