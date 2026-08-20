import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Screen from '@/pages/account/SubscriptionScreen';

/**
 * Smoke test for SubscriptionScreen.
 *
 * Shallow by design: mount the screen with plausible context and assert it
 * renders. That is a low bar, and it is the bar that was missing — pages/ sat
 * at 2.2%, so a screen could throw on mount (a bad import, a null deref on an
 * empty account) with nothing but a human clicking to notice. The AI handoff
 * row lost in the 3-tab redesign was this same class of failure.
 *
 * One file per screen on purpose: these pull large module graphs, and vitest
 * isolates per file. Combining several in one file made the run hang.
 */

const auth = {
  user: { id: 'user-1', email: 'a@b.com' }, session: { user: { id: 'user-1' } },
  profile: { full_name: 'A' }, loading: false, planKey: 'free',
  subscriptionStatus: 'free', isPremium: false, billingInterval: null,
  currentPeriodEnd: null, cancelAtPeriodEnd: false, scheduledPlanKey: null,
  scheduledChangeAt: null, priceId: null,
  refreshProfile: vi.fn(), waitForSubscriptionUpdate: vi.fn().mockResolvedValue(true),
  signIn: vi.fn().mockResolvedValue({ error: null }),
  signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
  signInWithGoogle: vi.fn(), signInWithApple: vi.fn(),
  signInWithFacebook: vi.fn(), signInWithDiscord: vi.fn(),
  signOut: vi.fn().mockResolvedValue({ error: null }),
};
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => auth }));

const data = {
  allGuides: [], allBundles: [], favorites: [], bundleLibrary: [], guideLibrary: [],
  availableLibraryBundles: [], isDataLoaded: true,
  fetchData: vi.fn(), getGuideById: () => null, toggleFavorite: vi.fn(),
  handleSaveGuide: vi.fn(), handleSaveBundle: vi.fn(), handleDeleteGuide: vi.fn(),
  handleDeleteBundle: vi.fn(), handleAddGuidesToBundle: vi.fn(),
  handleRemoveGuideFromBundle: vi.fn(), handleAddGuideFromLibrary: vi.fn(),
  handleAddBundleFromLibrary: vi.fn(), handleAddAndEditFromLibrary: vi.fn(),
};
vi.mock('@/contexts/DataContext', () => ({ useData: () => data }));

vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/services/AnalyticsService', () => ({ AnalyticsService: { track: vi.fn(), events: {} } }));
vi.mock('@/lib/errorLogger', () => ({ addBreadcrumb: vi.fn(), logError: vi.fn() }));
// iapActive is a FUNCTION (`IAP_ENABLED && isNative()`), not a boolean.
// Mocking it as `false` throws on mount — an easy and costly mistake.
vi.mock('@/lib/revenuecat', () => ({
  iapActive: () => false, initRevenueCat: vi.fn(), logoutRevenueCat: vi.fn(),
  getOfferings: vi.fn().mockResolvedValue(null), purchasePackage: vi.fn(),
}));
vi.mock('@/hooks/useNativePurchases', () => ({
  useNativePurchases: () => ({ offerings: null, loading: false, purchase: vi.fn(), restore: vi.fn() }),
}));
vi.mock('@/lib/native', () => ({ isNative: false, NATIVE_AUTH_REDIRECT: 'fp://auth' }));

// Every query resolves empty rather than hanging, so mount-time fetches settle.
const chain = () => {
  const c = {
    select: () => c, eq: () => c, in: () => c, order: () => c, limit: () => c,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (r) => Promise.resolve({ data: [], error: null }).then(r),
  };
  return c;
};
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => chain(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

const mount = () => render(
  <MemoryRouter initialEntries={['/plans']}><Screen /></MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  auth.planKey = 'free'; auth.subscriptionStatus = 'free'; auth.isPremium = false;
  data.allGuides = []; data.allBundles = [];
});

describe('SubscriptionScreen', () => {
  it('offers the paid tiers to a free user', async () => {
    mount();
    // This screen is the only upgrade path; if it throws, nobody can pay.
    expect(await screen.findByText(/Couple/i)).toBeInTheDocument();
    expect(screen.getByText(/Family/i)).toBeInTheDocument();
  });

  it('renders for a subscribed user', async () => {
    auth.planKey = 'family'; auth.subscriptionStatus = 'active';
    auth.isPremium = true; auth.currentPeriodEnd = '2026-09-01T00:00:00Z';
    mount();
    expect(await screen.findByText(/Family/i)).toBeInTheDocument();
  });

  it('renders for a user with a scheduled downgrade', async () => {
    auth.planKey = 'family'; auth.subscriptionStatus = 'active'; auth.isPremium = true;
    auth.scheduledPlanKey = 'free'; auth.scheduledChangeAt = '2026-09-01T00:00:00Z';
    mount();
    // "Family" appears more than once here (current plan + tier card), so
    // assert presence rather than uniqueness.
    expect((await screen.findAllByText(/Family/i)).length).toBeGreaterThan(0);
  });
});
