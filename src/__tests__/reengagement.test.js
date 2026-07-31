import { describe, it, expect } from 'vitest';
import { pickFreshnessCandidate, staleSinceLabel } from '@/lib/freshness';
import { detectGaps, ESSENTIAL_TOPICS } from '@/lib/gapDetection';

const NOW = new Date(2026, 6, 30);
const daysAgo = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();

const g = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  name: 'Bedtime routine',
  description: '',
  updated_at: daysAgo(10),
  is_shared_with_me: false,
  ...over,
});

describe('pickFreshnessCandidate', () => {
  it('returns null when everything is fresh', () => {
    expect(pickFreshnessCandidate([g(), g({ updated_at: daysAgo(89) })], new Set(), NOW)).toBeNull();
  });

  it('picks the stalest guide past 90 days', () => {
    const older = g({ id: 'older', updated_at: daysAgo(200) });
    const stale = g({ id: 'stale', updated_at: daysAgo(120) });
    expect(pickFreshnessCandidate([stale, older, g()], new Set(), NOW).id).toBe('older');
  });

  it('prefers safety-critical guides even when less stale', () => {
    const boring = g({ id: 'boring', name: 'Plant watering', updated_at: daysAgo(300) });
    const safety = g({ id: 'safety', name: 'Emergency contacts', updated_at: daysAgo(100) });
    expect(pickFreshnessCandidate([boring, safety], new Set(), NOW).id).toBe('safety');
  });

  it('a recent confirmation resets the clock', () => {
    const confirmed = g({ updated_at: daysAgo(200), last_confirmed_at: daysAgo(5) });
    expect(pickFreshnessCandidate([confirmed], new Set(), NOW)).toBeNull();
  });

  it('respects snoozes and ignores shared-with-me guides', () => {
    const snoozed = g({ id: 'sn', updated_at: daysAgo(200) });
    const shared = g({ id: 'sh', updated_at: daysAgo(300), is_shared_with_me: true });
    expect(pickFreshnessCandidate([snoozed, shared], new Set(['sn']), NOW)).toBeNull();
  });

  it('labels the stale-since month humanly', () => {
    expect(staleSinceLabel(g({ updated_at: new Date(2026, 2, 10).toISOString() }))).toMatch(/March 2026/);
  });
});

describe('detectGaps', () => {
  it('never greets an empty account', () => {
    expect(detectGaps([], new Set())).toEqual([]);
  });

  it('reports all essential topics for a playbook with one unrelated guide', () => {
    expect(detectGaps([g()], new Set()).map((t) => t.key)).toEqual(
      ESSENTIAL_TOPICS.map((t) => t.key)
    );
  });

  it('matches coverage by name or description, case-insensitive', () => {
    const guides = [
      g({ name: 'What to do in an EMERGENCY' }),
      g({ name: 'Kitchen', description: 'wifi password is on the fridge' }),
    ];
    const keys = detectGaps(guides, new Set()).map((t) => t.key);
    expect(keys).not.toContain('emergency');
    expect(keys).not.toContain('home_basics');
    expect(keys).toContain('allergies');
    expect(keys).toContain('medications');
  });

  it('honors permanent dismissals and ignores shared-with-me coverage', () => {
    const guides = [g(), g({ name: 'Allergy list', is_shared_with_me: true })];
    const keys = detectGaps(guides, new Set(['medications'])).map((t) => t.key);
    expect(keys).toContain('allergies'); // shared guide doesn't count as YOUR coverage
    expect(keys).not.toContain('medications'); // dismissed
  });

  it('every starter template is a complete, saveable draft', () => {
    for (const t of ESSENTIAL_TOPICS) {
      expect(t.starter.name).toBeTruthy();
      expect(['How To', 'Find It', 'Reference']).toContain(t.starter.category);
      expect(t.starter.steps.length).toBeGreaterThan(0);
    }
  });
});
