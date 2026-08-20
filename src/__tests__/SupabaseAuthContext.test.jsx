import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * AuthProvider owns the session and every billing field the rest of the app
 * reads — useSubscription, EntitlementGuard and the paid-feature gates all
 * derive from it. It was at 0% coverage across 419 lines.
 *
 * The behaviour worth pinning is defensive: what happens when the server has
 * already invalidated a session, and what the app believes when billing data
 * is missing. Getting either wrong either locks a paying user out or hands a
 * free user a paid feature.
 */

const auth = {};
const tables = {};
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    supabaseUrl: 'https://proj-ref.supabase.co',
    auth: {
      getSession: (...a) => auth.getSession(...a),
      getUser: (...a) => auth.getUser(...a),
      signOut: (...a) => auth.signOut(...a),
      signInWithPassword: (...a) => auth.signInWithPassword(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (table) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(tables[table] ?? { data: null }) }) }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/native', () => ({ isNative: false, NATIVE_AUTH_REDIRECT: 'familyplaybook://auth' }));

const initRevenueCat = vi.fn();
const logoutRevenueCat = vi.fn();
vi.mock('@/lib/revenuecat', () => ({
  initRevenueCat: (...a) => initRevenueCat(...a),
  logoutRevenueCat: (...a) => logoutRevenueCat(...a),
}));

// Surfaces the context so assertions read against rendered text.
let ctx;
const Probe = () => {
  ctx = useAuth();
  return <div data-testid="ready">{ctx.loading ? 'loading' : 'ready'}</div>;
};
const renderAuth = async () => {
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('ready'));
};

const USER = { id: 'user-1', email: 'a@b.com' };
const SESSION = { user: USER, access_token: 'tok' };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.keys(tables).forEach((k) => delete tables[k]);
  auth.getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
  auth.getUser = vi.fn().mockResolvedValue({ data: { user: USER }, error: null });
  auth.signOut = vi.fn().mockResolvedValue({ error: null });
  auth.signInWithPassword = vi.fn().mockResolvedValue({ data: { user: USER }, error: null });
});

describe('signed-out start', () => {
  it('settles to a signed-out, free state', async () => {
    await renderAuth();
    expect(ctx.user).toBeNull();
    expect(ctx.planKey).toBe('free');
    expect(ctx.isPremium).toBe(false);
  });
});

describe('session validation', () => {
  it('validates a stored session against the server, not just local storage', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    tables.user_billing = { data: { plan_key: 'couple', subscription_status: 'active' } };

    await renderAuth();

    // getSession() only reads local storage; getUser() is the round trip that
    // catches a token revoked server-side. Both must happen.
    expect(auth.getUser).toHaveBeenCalled();
    expect(ctx.user).toEqual(USER);
  });

  it('clears state WITHOUT calling signOut when the server says session_not_found', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 403, code: 'session_not_found', message: 'session_not_found' },
    });

    await renderAuth();

    expect(ctx.user).toBeNull();
    expect(ctx.planKey).toBe('free');
    // Calling signOut against an already-dead session is what caused the 403
    // loop this branch exists to avoid.
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('attempts a graceful signOut for other validation errors', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 500, message: 'boom' } });

    await renderAuth();

    expect(auth.signOut).toHaveBeenCalled();
    expect(ctx.user).toBeNull();
  });
});

describe('billing state', () => {
  const signedIn = (billing) => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    tables.user_billing = { data: billing };
    tables.profiles = { data: { id: USER.id, full_name: 'A' } };
  };

  it('defaults to free when the user has no billing row', async () => {
    signedIn(null);
    await renderAuth();
    expect(ctx.planKey).toBe('free');
    expect(ctx.subscriptionStatus).toBe('free');
    expect(ctx.cancelAtPeriodEnd).toBe(false);
    expect(ctx.isPremium).toBe(false);
  });

  it('exposes a scheduled downgrade', async () => {
    signedIn({ plan_key: 'family', subscription_status: 'active', scheduled_plan_key: 'free', scheduled_change_at: '2026-09-01' });
    await renderAuth();
    expect(ctx.scheduledPlanKey).toBe('free');
    expect(ctx.scheduledChangeAt).toBe('2026-09-01');
  });

  it('identifies the native purchaser to RevenueCat on a valid session', async () => {
    signedIn({ plan_key: 'couple', subscription_status: 'active' });
    await renderAuth();
    expect(initRevenueCat).toHaveBeenCalledWith(USER.id);
  });
});

describe('isPremium requires BOTH an active status and a paid plan', () => {
  const cases = [
    ['active',    'couple', true],
    ['active',    'family', true],
    ['trialing',  'couple', true],
    // A paid plan with a dead subscription must NOT unlock features — this is
    // the shape a lapsed payment leaves behind.
    ['canceled',  'family', false],
    ['past_due',  'couple', false],
    ['incomplete','family', false],
    // An active status on the free plan must not either.
    ['active',    'free',   false],
    [null,        'couple', false],
  ];

  it.each(cases)('status=%s plan=%s -> isPremium=%s', async (status, plan, expected) => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    tables.user_billing = { data: { subscription_status: status, plan_key: plan } };

    await renderAuth();

    expect(ctx.isPremium).toBe(expected);
  });
});

describe('signOut', () => {
  it('clears local state even when the network call fails', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    tables.user_billing = { data: { plan_key: 'family', subscription_status: 'active' } };
    await renderAuth();
    expect(ctx.isPremium).toBe(true);

    auth.signOut.mockRejectedValue(new Error('network down'));
    await act(async () => { await ctx.signOut(); });

    // A sign-out that leaves paid state behind because the network blipped is
    // worse than one that fails loudly.
    expect(ctx.user).toBeNull();
    expect(ctx.planKey).toBe('free');
    expect(ctx.isPremium).toBe(false);
    expect(logoutRevenueCat).toHaveBeenCalled();
  });

  it('skips the network call when no local session exists', async () => {
    await renderAuth();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await act(async () => { await ctx.signOut(); });

    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('purges every Supabase auth token from local storage', async () => {
    localStorage.setItem('sb-proj-ref-auth-token', 'x');
    localStorage.setItem('sb-other-project-auth-token', 'y');
    localStorage.setItem('sb-access-token', 'z');
    localStorage.setItem('keep-me', 'untouched');

    await renderAuth();
    await act(async () => { await ctx.signOut(); });

    expect(localStorage.getItem('sb-proj-ref-auth-token')).toBeNull();
    expect(localStorage.getItem('sb-other-project-auth-token')).toBeNull();
    expect(localStorage.getItem('sb-access-token')).toBeNull();
    // Stale sb- tokens caused re-login loops; unrelated keys must survive.
    expect(localStorage.getItem('keep-me')).toBe('untouched');
  });
});
