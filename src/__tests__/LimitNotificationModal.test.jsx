import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LimitNotificationModal from '../components/LimitNotificationModal.jsx';
import { useLimitNotification } from '@/contexts/LimitNotificationContext';

// Auto-mock the context hook so we control isOpen / notificationData per test
vi.mock('@/contexts/LimitNotificationContext', () => ({ useLimitNotification: vi.fn() }));

// Prevent AnalyticsService from making real Supabase calls
vi.mock('@/services/AnalyticsService', () => ({
  AnalyticsService: {
    track: vi.fn(),
    events: {
      LIMIT_HIT_SHOWN: 'limit_hit_shown',
      UPGRADE_CTA_CLICKED: 'upgrade_cta_clicked',
    },
  },
}));

// Intercept navigate while keeping the rest of react-router-dom real
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const hideLimitNotification = vi.fn();

function renderModal(notificationData) {
  useLimitNotification.mockReturnValue({
    isOpen: true,
    notificationData,
    hideLimitNotification,
  });
  // MemoryRouter supplies the router context that useNavigate requires
  return render(
    <MemoryRouter>
      <LimitNotificationModal />
    </MemoryRouter>
  );
}

const defaultData = {
  reason_code: 'LIMIT_ACTIVE_GUIDES',
  current: 3,
  limit: 3,
  upgrade_suggestion: 'couple',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LimitNotificationModal', () => {
  it('displays the correct title and description for each reason_code', () => {
    renderModal({ ...defaultData, reason_code: 'LIMIT_STORAGE' });
    expect(screen.getByText('Storage Full')).toBeInTheDocument();
    expect(screen.getByText("You've used all your file storage space.")).toBeInTheDocument();
  });

  it('displays a fallback DEFAULT message for an unrecognised reason_code', () => {
    renderModal({ ...defaultData, reason_code: 'UNKNOWN_REASON' });
    expect(screen.getByText('Limit Reached')).toBeInTheDocument();
    expect(screen.getByText("You've hit a limit on your current plan.")).toBeInTheDocument();
  });

  it('handles a null limit gracefully in the progress bar', () => {
    // limit: null → the guard (limit || 1) prevents division by zero;
    // Math.min((5 / 1) * 100, 100) = 100, so the bar fills to 100%
    renderModal({ ...defaultData, limit: null, current: 5 });

    const progressFill = document.querySelector('.bg-red-500');
    expect(progressFill).not.toBeNull();
    expect(progressFill.style.width).toBe('100%');
  });

  it('navigates to the subscription page with the upgrade suggestion when Upgrade is clicked', async () => {
    const user = userEvent.setup();
    renderModal(defaultData);

    await user.click(screen.getByRole('button', { name: /upgrade to couple/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/account/subscription', {
      state: { suggestion: 'couple' },
    });
    expect(hideLimitNotification).toHaveBeenCalled();
  });

  it('calls hideLimitNotification when Not now is clicked', async () => {
    const user = userEvent.setup();
    renderModal(defaultData);

    await user.click(screen.getByRole('button', { name: /not now/i }));

    expect(hideLimitNotification).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
