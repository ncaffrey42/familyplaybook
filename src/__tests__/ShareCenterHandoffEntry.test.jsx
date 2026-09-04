import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ShareCenterScreen from '../pages/share/ShareCenterScreen.jsx';

/**
 * Guards the AI handoff entry point on the Share tab.
 *
 * The handoff assembler was once reachable only from a FAB on MyBundlesScreen.
 * The 3-tab redesign left that screen unrouted, so the FAB — the single door to
 * assemble-handoff-bundle — vanished while the sheet, the edge function and the
 * migration all stayed in place. Nothing failed; the feature was just
 * unreachable, which is exactly the kind of regression a build can't catch.
 *
 * These tests assert the door exists and opens, so losing it fails loudly.
 */

// Stub the sheet: this is about the entry point, not the sheet's internals.
vi.mock('@/components/HandoffAssembleSheet', () => ({
  default: ({ isOpen }) => (isOpen ? <div>handoff-sheet-open</div> : null),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/contexts/DataContext', () => ({
  useData: () => ({ allGuides: [], allBundles: [] }),
}));

vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Family sharing off keeps the fixture small; the handoff row is independent
// of it and gated only on AI_GENERATION_ENABLED.
const flags = { AI_GENERATION_ENABLED: true, FAMILY_SHARING_ENABLED: false };
vi.mock('@/lib/featureFlags', () => ({
  get AI_GENERATION_ENABLED() { return flags.AI_GENERATION_ENABLED; },
  get FAMILY_SHARING_ENABLED() { return flags.FAMILY_SHARING_ENABLED; },
  SHARE_TAB_MANAGE_ENABLED: false,
  SHARE_LABELS_ENABLED: false,
}));

// shared_links: .select().eq().order() must resolve to a data envelope.
vi.mock('@/lib/supabaseClient', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => Promise.resolve({ data: [] }),
    order: () => Promise.resolve({ data: [] }),
    then: (resolve) => Promise.resolve({ data: [] }).then(resolve),
  };
  return { supabase: { from: () => chain } };
});

const renderShareCenter = () =>
  render(
    <MemoryRouter>
      <ShareCenterScreen />
    </MemoryRouter>
  );

describe('Share Center — AI handoff entry point', () => {
  beforeEach(() => {
    flags.AI_GENERATION_ENABLED = true;
    flags.FAMILY_SHARING_ENABLED = false;
  });

  it('offers the handoff row when AI generation is enabled', async () => {
    renderShareCenter();
    expect(await screen.findByText('Assemble a handoff')).toBeInTheDocument();
  });

  it('opens the assemble sheet when the row is tapped', async () => {
    const user = userEvent.setup();
    renderShareCenter();

    expect(screen.queryByText('handoff-sheet-open')).not.toBeInTheDocument();
    await user.click(await screen.findByText('Assemble a handoff'));

    await waitFor(() =>
      expect(screen.getByText('handoff-sheet-open')).toBeInTheDocument()
    );
  });

  it('hides the row when AI generation is disabled', async () => {
    flags.AI_GENERATION_ENABLED = false;
    renderShareCenter();

    // Wait for the screen itself before asserting the absence, so this can't
    // pass simply because nothing has rendered yet.
    expect(await screen.findByText('Share a bundle')).toBeInTheDocument();
    expect(screen.queryByText('Assemble a handoff')).not.toBeInTheDocument();
  });
});
