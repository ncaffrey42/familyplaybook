import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntitlementGuard from '../components/EntitlementGuard.jsx';
import { useEntitlements } from '@/contexts/EntitlementContext';
import { useLimitNotification } from '@/contexts/LimitNotificationContext';

vi.mock('@/contexts/EntitlementContext', () => ({ useEntitlements: vi.fn() }));
vi.mock('@/contexts/LimitNotificationContext', () => ({ useLimitNotification: vi.fn() }));

const checkEntitlement = vi.fn();
const showLimitNotification = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useEntitlements.mockReturnValue({ checkEntitlement });
  useLimitNotification.mockReturnValue({ showLimitNotification });
});

describe('EntitlementGuard', () => {
  it('renders children when entitlement is allowed', async () => {
    checkEntitlement.mockResolvedValue({ allowed: true });

    render(
      <EntitlementGuard action="GUIDE_CREATE">
        <button>Create Guide</button>
      </EntitlementGuard>
    );

    await screen.findByText('Create Guide');
    expect(screen.queryByText('Upgrade to unlock')).toBeNull();
  });

  it('renders locked overlay when entitlement is denied', async () => {
    checkEntitlement.mockResolvedValue({
      allowed: false,
      reason_code: 'LIMIT_ACTIVE_GUIDES',
      current: 3,
      limit: 3,
      upgrade_suggestion: 'couple',
    });

    render(
      <EntitlementGuard action="GUIDE_CREATE">
        <button>Create Guide</button>
      </EntitlementGuard>
    );

    // Lock badge must appear
    await screen.findByText('Upgrade to unlock');
    // Children are still in the DOM (just visually locked)
    expect(screen.getByText('Create Guide')).toBeInTheDocument();
    // The wrapper is labelled for accessibility
    expect(screen.getByRole('button', { name: /upgrade required/i })).toBeInTheDocument();
  });

  it('re-checks entitlement when the action prop changes', async () => {
    checkEntitlement.mockResolvedValue({ allowed: true });

    const { rerender } = render(
      <EntitlementGuard action="GUIDE_CREATE">
        <span>content</span>
      </EntitlementGuard>
    );

    await screen.findByText('content');
    expect(checkEntitlement).toHaveBeenCalledWith('GUIDE_CREATE', {});

    rerender(
      <EntitlementGuard action="BUNDLE_CREATE">
        <span>content</span>
      </EntitlementGuard>
    );

    await waitFor(() => {
      expect(checkEntitlement).toHaveBeenCalledWith('BUNDLE_CREATE', {});
    });
    expect(checkEntitlement).toHaveBeenCalledTimes(2);
  });

  it('opens the limit modal when a locked guard is clicked', async () => {
    const user = userEvent.setup();
    checkEntitlement.mockResolvedValue({
      allowed: false,
      reason_code: 'LIMIT_BUNDLES',
      current: 1,
      limit: 1,
      upgrade_suggestion: 'couple',
    });

    render(
      <EntitlementGuard action="BUNDLE_CREATE">
        <button>Create Bundle</button>
      </EntitlementGuard>
    );

    await screen.findByText('Upgrade to unlock');
    await user.click(screen.getByRole('button', { name: /upgrade required/i }));

    expect(showLimitNotification).toHaveBeenCalledWith(
      'LIMIT_BUNDLES', 1, 1, 'couple'
    );
  });
});
