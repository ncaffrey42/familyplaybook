import { describe, it, expect } from 'vitest';
import {
  SHARE_WINDOW_TONIGHT,
  SHARE_WINDOW_WEEKEND,
  SHARE_WINDOW_FOREVER,
  expiryForWindow,
  isLive,
  windowIdFor,
  describeWindow,
  windowLabel,
} from '@/lib/shareWindows';

// A Wednesday evening, local time.
const WED_EVENING = new Date(2026, 7, 5, 19, 30, 0);

describe('expiryForWindow', () => {
  it('closes "tonight" at the end of the local day', () => {
    const expiry = new Date(expiryForWindow(SHARE_WINDOW_TONIGHT, WED_EVENING));
    expect(expiry.getDate()).toBe(WED_EVENING.getDate());
    expect(expiry.getHours()).toBe(23);
    expect(expiry.getMinutes()).toBe(59);
  });

  it('closes "this weekend" on Sunday evening', () => {
    const expiry = new Date(expiryForWindow(SHARE_WINDOW_WEEKEND, WED_EVENING));
    expect(expiry.getDay()).toBe(0); // Sunday
    expect(expiry.getHours()).toBe(20);
    expect(expiry > WED_EVENING).toBe(true);
  });

  it('rolls the weekend forward when Sunday evening has already passed', () => {
    const sundayLate = new Date(2026, 7, 9, 21, 0, 0); // Sunday 9pm
    const expiry = new Date(expiryForWindow(SHARE_WINDOW_WEEKEND, sundayLate));
    expect(expiry.getDay()).toBe(0);
    expect(expiry > sundayLate).toBe(true);
    expect(expiry.getDate()).toBe(16); // the following Sunday
  });

  it('gives "until I switch it off" no expiry at all', () => {
    expect(expiryForWindow(SHARE_WINDOW_FOREVER, WED_EVENING)).toBeNull();
  });

  it('treats an unknown window id as no expiry rather than throwing', () => {
    expect(expiryForWindow('next-tuesday-ish', WED_EVENING)).toBeNull();
  });
});

describe('isLive', () => {
  it('treats a link with no expiry as live — that is every pre-existing link', () => {
    expect(isLive({ expires_at: null }, WED_EVENING)).toBe(true);
    expect(isLive({}, WED_EVENING)).toBe(true);
  });

  it('is live before the expiry and closed after it', () => {
    const soon = new Date(WED_EVENING.getTime() + 60_000).toISOString();
    const past = new Date(WED_EVENING.getTime() - 60_000).toISOString();
    expect(isLive({ expires_at: soon }, WED_EVENING)).toBe(true);
    expect(isLive({ expires_at: past }, WED_EVENING)).toBe(false);
  });
});

describe('windowIdFor', () => {
  it('recognises the presets it produced', () => {
    expect(windowIdFor(null)).toBe(SHARE_WINDOW_FOREVER);
    expect(
      windowIdFor(expiryForWindow(SHARE_WINDOW_TONIGHT, WED_EVENING), WED_EVENING)
    ).toBe(SHARE_WINDOW_TONIGHT);
    expect(
      windowIdFor(expiryForWindow(SHARE_WINDOW_WEEKEND, WED_EVENING), WED_EVENING)
    ).toBe(SHARE_WINDOW_WEEKEND);
  });

  it('returns null for a custom expiry rather than mislabelling it', () => {
    const custom = new Date(2026, 7, 6, 9, 0, 0).toISOString();
    expect(windowIdFor(custom, WED_EVENING)).toBeNull();
  });
});

describe('describeWindow', () => {
  it('says "until you turn it off" when there is no expiry', () => {
    expect(describeWindow({ expires_at: null }, WED_EVENING)).toBe('until you turn it off');
  });

  it('reads an end-of-day expiry as midnight, not 11:59pm', () => {
    const tonight = expiryForWindow(SHARE_WINDOW_TONIGHT, WED_EVENING);
    expect(describeWindow({ expires_at: tonight }, WED_EVENING)).toBe('until midnight');
  });

  it('names the weekday for a window that ends on another day', () => {
    const weekend = expiryForWindow(SHARE_WINDOW_WEEKEND, WED_EVENING);
    expect(describeWindow({ expires_at: weekend }, WED_EVENING)).toMatch(/Sunday$/);
  });

  it('reports a passed window as closed', () => {
    const past = new Date(WED_EVENING.getTime() - 60_000).toISOString();
    expect(describeWindow({ expires_at: past }, WED_EVENING)).toBe('closed');
  });
});

describe('windowLabel', () => {
  it('leads with "Tonight" only when the window ends today', () => {
    const tonight = expiryForWindow(SHARE_WINDOW_TONIGHT, WED_EVENING);
    const weekend = expiryForWindow(SHARE_WINDOW_WEEKEND, WED_EVENING);
    expect(windowLabel({ expires_at: tonight }, WED_EVENING)).toBe('Tonight · until midnight');
    expect(windowLabel({ expires_at: weekend }, WED_EVENING)).toMatch(/^Shared with you · /);
  });

  it('falls back to the plain guest label for an open-ended link', () => {
    expect(windowLabel({ expires_at: null }, WED_EVENING)).toBe('Shared with you');
  });
});
