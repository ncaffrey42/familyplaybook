import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSubscription, toFunctionError } from '@/hooks/useSubscription';

/**
 * useSubscription decides what plan the UI believes the user is on, and owns
 * the two write paths that cost money (checkout, downgrade). It was at 0%
 * coverage — these tests cover the behaviour a billing bug would break.
 */

const authState = {};
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => authState }));

const toast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));

const track = vi.fn();
vi.mock('@/services/AnalyticsService', () => ({ AnalyticsService: { track: (...a) => track(...a) } }));

// Per-table fixtures the chainable mock serves. `single()` feeds the plans
// lookup; awaiting `.eq()` feeds the two list queries.
const db = { plans: { data: { id: 'plan-uuid' } }, plan_entitlements: { data: [] }, user_usage: { data: [] } };
const invoke = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(db.plans),
          then: (resolve) => Promise.resolve(db[table] ?? { data: [] }).then(resolve),
        }),
      }),
    }),
    functions: { invoke: (...a) => invoke(...a) },
  },
}));

const setAuth = (over = {}) => {
  Object.keys(authState).forEach((k) => delete authState[k]);
  Object.assign(authState, {
    user: { id: 'user-1' }, planKey: 'couple', subscriptionStatus: 'active',
    currentPeriodEnd: '2026-09-01T00:00:00Z', cancelAtPeriodEnd: false,
    billingInterval: 'month', scheduledPlanKey: null, scheduledChangeAt: null,
    ...over,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  db.plans = { data: { id: 'plan-uuid' } };
  db.plan_entitlements = { data: [] };
  db.user_usage = { data: [] };
  setAuth();
});

describe('toFunctionError', () => {
  it('surfaces the edge function\'s own message and code, not the generic one', async () => {
    const raw = new Error('Edge Function returned a non-2xx status code');
    raw.context = { json: async () => ({ error: 'You already have an active subscription.', code: 'already_subscribed' }) };

    const err = await toFunctionError(raw);

    expect(err.message).toBe('You already have an active subscription.');
    expect(err.code).toBe('already_subscribed');
  });

  it('keeps the generic message when there is no JSON body', async () => {
    const raw = new Error('boom');
    raw.context = { json: async () => { throw new SyntaxError('not json'); } };

    const err = await toFunctionError(raw);

    expect(err.message).toBe('boom');
    expect(err.code).toBeNull();
  });

  it('tolerates an error with no context at all', async () => {
    const err = await toFunctionError(new Error('offline'));
    expect(err.message).toBe('offline');
    expect(err.code).toBeNull();
  });
});

describe('useSubscription — reading state', () => {
  it('reports no subscription and stops loading when signed out', async () => {
    setAuth({ user: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subscription).toBeNull();
  });

  it('maps usage rows into a feature_key -> current_usage lookup', async () => {
    db.user_usage = { data: [
      { feature_key: 'guides', current_usage: 3 },
      { feature_key: 'ai_generation', current_usage: 12 },
    ] };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.subscription).not.toBeNull());
    expect(result.current.subscription.usage).toEqual({ guides: 3, ai_generation: 12 });
  });

  it('falls back to the Free display name for an unknown plan key', async () => {
    setAuth({ planKey: 'not-a-real-plan', subscriptionStatus: null });

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.subscription).not.toBeNull());
    expect(result.current.subscription.plan_name).toBe('Free');
    // A missing status must read as 'free', never as undefined — the UI
    // branches on this to decide whether to show billing controls.
    expect(result.current.subscription.status).toBe('free');
  });

  it('carries a scheduled downgrade through to the subscription object', async () => {
    setAuth({ scheduledPlanKey: 'free', scheduledChangeAt: '2026-09-01T00:00:00Z' });

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.subscription).not.toBeNull());
    expect(result.current.subscription.scheduled_plan_key).toBe('free');
    expect(result.current.subscription.scheduled_change_at).toBe('2026-09-01T00:00:00Z');
  });
});

describe('useSubscription — checkout', () => {
  it('passes the plan and interval to the edge function', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://checkout' }, error: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let out;
    await act(async () => { out = await result.current.createCheckoutSession('family', 'year'); });

    expect(invoke).toHaveBeenCalledWith('create-checkout-session', {
      body: { plan_key: 'family', billing_interval: 'year' },
    });
    expect(out).toEqual({ url: 'https://checkout' });
    expect(track).toHaveBeenCalledWith('checkout_started', { planKey: 'family', billingInterval: 'year' });
  });

  it('rethrows the unwrapped message and shows it to the user', async () => {
    const raw = new Error('Edge Function returned a non-2xx status code');
    raw.context = { json: async () => ({ error: 'Card declined.', code: 'card_declined' }) };
    invoke.mockResolvedValue({ data: null, error: raw });

    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(act(async () => { await result.current.createCheckoutSession('family'); }))
      .rejects.toThrow('Card declined.');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Card declined.', variant: 'destructive',
    }));
  });
});

describe('useSubscription — downgrade', () => {
  it('tells the user the change is scheduled, naming the date', async () => {
    invoke.mockResolvedValue({ data: { effective_date: '2026-09-01T00:00:00Z' }, error: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.downgradeSubscription('free'); });

    const [[arg]] = toast.mock.calls;
    expect(arg.title).toBe('Downgrade scheduled');
    // The whole point: a downgrade is NOT immediate. Saying otherwise is the
    // billing bug this test exists to prevent.
    expect(arg.description).toMatch(/keep your current plan until/i);
    expect(arg.description).toContain('2026');
    expect(track).toHaveBeenCalledWith('downgrade_completed', { toPlanKey: 'free' });
  });

  it('still says end-of-period when the server returns no effective_date', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.downgradeSubscription('free'); });

    expect(toast.mock.calls[0][0].description).toMatch(/end of your billing period/i);
  });

  it('treats a 200 response carrying success:false as a failure', async () => {
    // The edge function can return HTTP 200 with a body saying it failed.
    // Missing that check would report a downgrade that never happened.
    invoke.mockResolvedValue({ data: { success: false, error: 'No active subscription' }, error: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(act(async () => { await result.current.downgradeSubscription('free'); }))
      .rejects.toThrow('No active subscription');
    expect(track).not.toHaveBeenCalledWith('downgrade_completed', expect.anything());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Downgrade Failed' }));
  });

  it('sends the current billing interval, defaulting to month', async () => {
    setAuth({ billingInterval: null });
    invoke.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.downgradeSubscription('free'); });

    expect(invoke).toHaveBeenCalledWith('change-subscription-plan', {
      body: { plan_key: 'free', billing_interval: 'month' },
    });
  });
});
