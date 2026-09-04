import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataProvider, useData } from '@/contexts/DataContext';

/**
 * DataContext caches the user's guides and bundles in localStorage so the app
 * paints instantly on reload. That cache is keyed on user id, and the reason
 * matters: on a shared device, serving a stale cache to the wrong account
 * shows one family's private guides to another. It was at 0% coverage across
 * 547 lines.
 *
 * These tests pin the cache's invalidation rules and the library de-duplication,
 * which are the parts with a wrong-data failure mode rather than a crash.
 */

const CACHE_KEY = 'family_playbook_data_cache';
const TOKEN_KEY = 'sb-proj-ref-auth-token';

const authState = { user: null, session: null };
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/errorLogger', () => ({ addBreadcrumb: vi.fn(), logError: vi.fn() }));
vi.mock('@/services/EntitlementService', () => ({
  entitlementService: { checkAction: vi.fn().mockResolvedValue({ allowed: true }), invalidate: vi.fn() },
}));
vi.mock('@/services/UsageTrackingService', () => ({ UsageTrackingService: { increment: vi.fn(), decrement: vi.fn() } }));
vi.mock('@/lib/readOnlyEnforcement', () => ({ applyReadOnlyFlags: (rows) => rows }));
vi.mock('@/lib/feedback', () => ({ triggerCheckpoint: vi.fn() }));

// Every fetchData query resolves empty unless a test overrides it, so the
// provider reaches its loaded state without inventing server data.
const rows = {};
const q = (table) => {
  const res = () => Promise.resolve({ data: rows[table] ?? [], error: null });
  const chain = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, then: (r) => res().then(r) };
  return chain;
};
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t) => q(t) } }));

let ctx;
const Probe = () => {
  ctx = useData();
  return <div data-testid="s">{ctx.isDataLoaded ? 'loaded' : 'empty'}</div>;
};
const renderData = () => render(
  <MemoryRouter><DataProvider><Probe /></DataProvider></MemoryRouter>
);

const seedSession = (userId) =>
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ user: { id: userId } }));

// The provider's load effect keys on `session`, not `user`: with no session it
// deliberately wipes state and drops the cache (see "signing out" below). Tests
// that exercise the cache must therefore be signed in.
const signedIn = (userId) => {
  authState.user = { id: userId };
  authState.session = { user: { id: userId } };
};

const seedCache = (userId, over = {}) =>
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    userId, allBundles: [], allGuides: [], favorites: [], bundleLibrary: [], guideLibrary: [],
    timestamp: Date.now(), ...over,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.keys(rows).forEach((k) => delete rows[k]);
  authState.user = null;
  authState.session = null;
});

describe('cache is scoped to the user who wrote it', () => {
  it('serves a cache written by the signed-in user', () => {
    seedSession('user-1'); signedIn('user-1');
    seedCache('user-1', { allGuides: [{ id: 'g1', name: 'Bedtime' }] });

    renderData(); // assert on the first paint, before the refetch resolves

    expect(screen.getByTestId('s')).toHaveTextContent('loaded');
    expect(ctx.allGuides).toHaveLength(1);
  });

  it('DISCARDS a cache belonging to a different user, and deletes it', () => {
    seedSession('user-2'); signedIn('user-2');
    seedCache('user-1', { allGuides: [{ id: 'g1', name: 'Private to user-1' }] });

    renderData();

    // The data leak this guard exists to prevent.
    expect(ctx.allGuides).toEqual([]);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')?.allGuides ?? [])
      .not.toContainEqual(expect.objectContaining({ name: 'Private to user-1' }));
  });

  it('keeps the cache when no session token is present to compare against', () => {
    // No token to compare against: the cache is not proven to be someone
    // else's, and dropping it would cost a needless refetch.
    signedIn('user-1');
    seedCache('user-1', { allGuides: [{ id: 'g1', name: 'Bedtime' }] });

    renderData();

    expect(ctx.allGuides).toHaveLength(1);
  });

  it('survives a corrupt cache without crashing', () => {
    seedSession('user-1'); signedIn('user-1');
    localStorage.setItem(CACHE_KEY, '{not json');

    expect(() => renderData()).not.toThrow();
    expect(ctx.allGuides).toEqual([]);
  });

  it('survives a corrupt session token without crashing', () => {
    signedIn('user-1');
    localStorage.setItem(TOKEN_KEY, 'not-json-either');
    seedCache('user-1', { allGuides: [{ id: 'g1' }] });

    expect(() => renderData()).not.toThrow();
  });
});

describe('cache writing', () => {
  it('writes a cache stamped with the current user id after loading', async () => {
    signedIn('user-9');
    rows.guides = [{ id: 'g1', name: 'Bedtime', pack_guides: [] }];

    renderData();

    await waitFor(() => expect(localStorage.getItem(CACHE_KEY)).not.toBeNull());
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).userId).toBe('user-9');
  });

  it('writes no cache while signed out', async () => {
    renderData();
    await new Promise((r) => setTimeout(r, 20));
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});

describe('signing out', () => {
  it('wipes cached content from localStorage when there is no session', async () => {
    seedSession('user-1');
    seedCache('user-1', { allGuides: [{ id: 'g1', name: 'Bedtime' }] });
    // authState.session stays null — this is the signed-out path.

    renderData();

    // Leaving a previous user's guides on a shared device is the risk here.
    await waitFor(() => expect(localStorage.getItem(CACHE_KEY)).toBeNull());
    expect(ctx.allGuides).toEqual([]);
  });
});

describe('availableLibraryBundles hides what the user already added', () => {
  it('filters library bundles the user already owns via template_id', () => {
    seedSession('user-1'); signedIn('user-1');
    seedCache('user-1', {
      allBundles: [{ id: 'b1', template_id: 'lib-1' }],
      bundleLibrary: [{ id: 'lib-1', name: 'Already added' }, { id: 'lib-2', name: 'Still available' }],
    });

    renderData();

    expect(ctx.availableLibraryBundles.map((b) => b.id)).toEqual(['lib-2']);
  });

  it('ignores user bundles with no template_id', () => {
    seedSession('user-1'); signedIn('user-1');
    seedCache('user-1', {
      allBundles: [{ id: 'b1', template_id: null }, { id: 'b2' }],
      bundleLibrary: [{ id: 'lib-1', name: 'Available' }],
    });

    renderData();

    // A null template_id must not collapse into a match and hide the library.
    expect(ctx.availableLibraryBundles).toHaveLength(1);
  });
});
