import { describe, it, expect } from 'vitest';
import { HOST_ESSENTIAL_TOPICS, detectPropertyCoverage } from '@/lib/hostCoverage';
import { HOST_CATEGORIES } from '@/lib/hostTaxonomy';

/**
 * NOTE: vitest cannot currently run in this environment (Node v16 vs.
 * rolldown needing node:util styleText, >=20.12) — pre-existing, tracked in
 * docs/platform/ASK_PLAYBOOK.md §10. Written to run the moment it can.
 */

const g = (name, description = '') => ({ name, description });

describe('HOST_ESSENTIAL_TOPICS', () => {
  it('has nine topics, all keyed to real host taxonomy categories', () => {
    expect(HOST_ESSENTIAL_TOPICS).toHaveLength(9);
    const validCategories = new Set(HOST_CATEGORIES.map((c) => c.id));
    for (const topic of HOST_ESSENTIAL_TOPICS) {
      expect(validCategories.has(topic.category)).toBe(true);
    }
  });

  it('every topic ships a starter with steps in its own category', () => {
    for (const topic of HOST_ESSENTIAL_TOPICS) {
      expect(topic.starter.category).toBe(topic.category);
      expect(topic.starter.steps.length).toBeGreaterThan(0);
    }
  });

  it("every starter's own name/description satisfies its topic regex (self-coverage)", () => {
    // A topic whose starter guide, once added, still reads as "missing"
    // would loop the owner forever. Guard the invariant.
    for (const topic of HOST_ESSENTIAL_TOPICS) {
      const hay = `${topic.starter.name} ${topic.starter.description}`;
      expect(topic.match.test(hay)).toBe(true);
    }
  });
});

describe('detectPropertyCoverage', () => {
  it('empty playbook: everything missing, score 0 — the opposite of detectGaps', () => {
    const r = detectPropertyCoverage([]);
    expect(r.covered).toHaveLength(0);
    expect(r.missing).toHaveLength(9);
    expect(r.score).toBe(0);
  });

  it('null/undefined guides treated as empty', () => {
    expect(detectPropertyCoverage(null).score).toBe(0);
    expect(detectPropertyCoverage(undefined).missing).toHaveLength(9);
  });

  it('matches on name or description, case-insensitively', () => {
    const r = detectPropertyCoverage([
      g('Getting online', 'The WIFI password lives on the fridge'),
      g('Where to Park'),
    ]);
    const keys = r.covered.map((t) => t.key);
    expect(keys).toContain('wifi');
    expect(keys).toContain('parking');
    expect(r.missing.map((t) => t.key)).not.toContain('wifi');
  });

  it('full starter-kit-shaped playbook scores 1', () => {
    const guides = HOST_ESSENTIAL_TOPICS.map((t) =>
      g(t.starter.name, t.starter.description)
    );
    const r = detectPropertyCoverage(guides);
    expect(r.score).toBe(1);
    expect(r.missing).toHaveLength(0);
  });

  it('byCategory totals partition the nine topics across the host taxonomy', () => {
    const r = detectPropertyCoverage([]);
    const total = Object.values(r.byCategory).reduce((s, c) => s + c.total, 0);
    expect(total).toBe(9);
    // Every category present in the report is a real taxonomy key.
    const validCategories = new Set(HOST_CATEGORIES.map((c) => c.id));
    for (const key of Object.keys(r.byCategory)) {
      expect(validCategories.has(key)).toBe(true);
    }
  });

  it('byCategory covered counts track which categories the guides hit', () => {
    const r = detectPropertyCoverage([g('Check-in & getting in'), g('Check-out')]);
    expect(r.byCategory.Arrival.covered).toBe(1); // checkin (not parking)
    expect(r.byCategory.Departure.covered).toBe(1); // checkout (not trash)
    expect(r.byCategory.House.covered).toBe(0);
  });

  it('guides with missing name/description do not crash the matcher', () => {
    expect(() => detectPropertyCoverage([{}, { name: null }])).not.toThrow();
  });
});
