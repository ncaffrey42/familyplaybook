import { describe, it, expect } from 'vitest';
import {
  currentSeason, guideSeason, pickHostFreshnessCandidate, STALE_DAYS,
} from '@/lib/hostFreshness';

/**
 * vitest can't run in this environment (Node v16 vs rolldown ≥20.12,
 * ASK_PLAYBOOK.md §10). Logic verified in-browser instead; written to run
 * the moment CI's Node is fixed (ROLLOUT.md B4).
 */

const JAN = new Date('2026-01-15T12:00:00');
const JUL = new Date('2026-07-15T12:00:00');
const daysBefore = (ref, n) => new Date(ref.getTime() - n * 864e5).toISOString();
const g = (over = {}) => ({ id: over.id || 'g1', name: '', description: '', updated_at: JUL.toISOString(), ...over });

describe('currentSeason', () => {
  it('maps months to northern-hemisphere seasons', () => {
    expect(currentSeason(new Date('2026-01-15'))).toBe('winter');
    expect(currentSeason(new Date('2026-04-15'))).toBe('spring');
    expect(currentSeason(new Date('2026-07-15'))).toBe('summer');
    expect(currentSeason(new Date('2026-10-15'))).toBe('autumn');
    expect(currentSeason(new Date('2026-12-15'))).toBe('winter'); // Dec wraps
  });
  it('inverts for the southern hemisphere', () => {
    expect(currentSeason(new Date('2026-07-15'), 'south')).toBe('winter');
    expect(currentSeason(new Date('2026-01-15'), 'south')).toBe('summer');
  });
});

describe('guideSeason', () => {
  it('classifies seasonal content by keyword, null otherwise', () => {
    expect(guideSeason(g({ name: 'Pool & hot tub' }))).toBe('summer');
    expect(guideSeason(g({ name: 'Heating & fireplace' }))).toBe('winter');
    expect(guideSeason(g({ name: 'Wifi & internet' }))).toBeNull();
    expect(guideSeason(g({ description: 'clear the gutters of leaves' }))).toBe('autumn');
  });
});

describe('pickHostFreshnessCandidate — season-stale beats clock-stale', () => {
  it('surfaces the pool guide, last touched in winter, when summer arrives', () => {
    // The evocative case from the prompt.
    const pool = g({ id: 'pool', name: 'Pool guide', updated_at: JAN.toISOString() });
    const wifi = g({ id: 'wifi', name: 'Wifi', updated_at: daysBefore(JUL, 200) }); // clock-stale too
    const r = pickHostFreshnessCandidate([pool, wifi], new Set(), JUL);
    expect(r.id).toBe('pool');
    expect(r._reason).toBe('season');
    expect(r._season).toBe('summer');
  });

  it('does NOT flag a seasonal guide already touched this season', () => {
    const pool = g({ id: 'pool', name: 'Pool guide', updated_at: daysBefore(JUL, 3) }); // touched in summer
    expect(pickHostFreshnessCandidate([pool], new Set(), JUL)).toBeNull();
  });

  it("does not flag a summer guide in winter (its season isn't here)", () => {
    const pool = g({ id: 'pool', name: 'Pool guide', updated_at: daysBefore(JAN, 3) });
    // fresh (3 days), seasonal but off-season → nothing
    expect(pickHostFreshnessCandidate([pool], new Set(), JAN)).toBeNull();
  });

  it('falls back to plain 90-day staleness for non-seasonal content', () => {
    const checkin = g({ id: 'ci', name: 'Check-in', updated_at: daysBefore(JUL, STALE_DAYS + 5) });
    const r = pickHostFreshnessCandidate([checkin], new Set(), JUL);
    expect(r.id).toBe('ci');
    expect(r._reason).toBe('stale');
  });

  it('season-stale outranks a clock-stale non-seasonal guide', () => {
    const oldWifi = g({ id: 'wifi', name: 'Wifi', updated_at: daysBefore(JUL, 300) });
    const pool = g({ id: 'pool', name: 'Pool', updated_at: JAN.toISOString() });
    expect(pickHostFreshnessCandidate([oldWifi, pool], new Set(), JUL)._reason).toBe('season');
  });

  it('respects snoozes and empty/undefined input', () => {
    const pool = g({ id: 'pool', name: 'Pool', updated_at: JAN.toISOString() });
    expect(pickHostFreshnessCandidate([pool], new Set(['pool']), JUL)).toBeNull();
    expect(pickHostFreshnessCandidate([], new Set(), JUL)).toBeNull();
    expect(pickHostFreshnessCandidate(undefined, new Set(), JUL)).toBeNull();
  });

  it('at most one candidate is ever returned', () => {
    const a = g({ id: 'a', name: 'Pool', updated_at: JAN.toISOString() });
    const b = g({ id: 'b', name: 'Beach access', updated_at: JAN.toISOString() });
    const r = pickHostFreshnessCandidate([a, b], new Set(), JUL);
    expect(['a', 'b']).toContain(r.id); // one, not both
  });
});
