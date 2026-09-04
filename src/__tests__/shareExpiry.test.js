import { describe, it, expect } from 'vitest';
import { computeExpiry, presetFromExpiry, isExpired, humanizeExpiry } from '@/lib/shareExpiry';

// A fixed Wednesday afternoon, local time.
const WED = new Date(2026, 6, 29, 15, 30); // Jul 29 2026, 3:30pm

describe('computeExpiry', () => {
  it('tonight → next local midnight', () => {
    const iso = computeExpiry('tonight', WED);
    const d = new Date(iso);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(30); // the 30th at 00:00 local
  });

  it('weekend → upcoming Sunday 8pm local', () => {
    const d = new Date(computeExpiry('weekend', WED));
    expect(d.getDay()).toBe(0);
    expect(d.getHours()).toBe(20);
    expect(d.getDate()).toBe(2); // Sunday Aug 2
  });

  it('weekend on a Sunday evening rolls to NEXT Sunday', () => {
    const sundayNight = new Date(2026, 7, 2, 21, 0); // Sun Aug 2, 9pm (past 8pm)
    const d = new Date(computeExpiry('weekend', sundayNight));
    expect(d.getDay()).toBe(0);
    expect(d.getDate()).toBe(9);
  });

  it('until_off → null (never closes on its own)', () => {
    expect(computeExpiry('until_off', WED)).toBeNull();
  });
});

describe('presetFromExpiry', () => {
  it('maps null to until_off, near expiries to tonight, far to weekend', () => {
    expect(presetFromExpiry(null, WED)).toBe('until_off');
    expect(presetFromExpiry(computeExpiry('tonight', WED), WED)).toBe('tonight');
    expect(presetFromExpiry(computeExpiry('weekend', WED), WED)).toBe('weekend');
  });
});

describe('isExpired / humanizeExpiry', () => {
  it('flags past timestamps and words the future warmly', () => {
    const past = new Date(WED.getTime() - 60_000).toISOString();
    const in90m = new Date(WED.getTime() + 90 * 60_000).toISOString();
    const in3d = new Date(WED.getTime() + 3 * 864e5).toISOString();
    expect(isExpired(past, WED)).toBe(true);
    expect(isExpired(in90m, WED)).toBe(false);
    expect(isExpired(null, WED)).toBe(false);
    expect(humanizeExpiry(null)).toBe('until you switch it off');
    expect(humanizeExpiry(past, WED)).toBe('ended');
    expect(humanizeExpiry(in90m, WED)).toBe('closes in 2h');
    expect(humanizeExpiry(in3d, WED)).toBe('closes in 3d');
  });
});
