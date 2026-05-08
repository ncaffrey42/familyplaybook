import { describe, it, expect } from 'vitest';
import { applyReadOnlyFlags, countReadOnly } from '../lib/readOnlyEnforcement.js';

// Helper to build a guide-shaped item with deterministic timestamps.
// Higher `n` = more recently updated.
const guide = (id, n, overrides = {}) => ({
  id,
  name: `Guide ${id}`,
  updated_at: new Date(Date.UTC(2026, 0, n, 0, 0, 0)).toISOString(),
  ...overrides,
});

const idsOf = (items, predicate) => items.filter(predicate).map(i => i.id).sort();

describe('applyReadOnlyFlags', () => {
  describe('under limit', () => {
    it('flags nothing when item count is below the limit', () => {
      const items = [guide('a', 3), guide('b', 2), guide('c', 1)];

      const result = applyReadOnlyFlags(items, 5);

      expect(result.every(i => i.is_read_only === false)).toBe(true);
      expect(countReadOnly(items, 5)).toBe(0);
    });

    it('handles an empty list', () => {
      expect(applyReadOnlyFlags([], 5)).toEqual([]);
      expect(countReadOnly([], 5)).toBe(0);
    });
  });

  describe('exactly at limit', () => {
    it('flags nothing when item count equals the limit', () => {
      const items = [guide('a', 5), guide('b', 4), guide('c', 3), guide('d', 2), guide('e', 1)];

      const result = applyReadOnlyFlags(items, 5);

      expect(result.every(i => i.is_read_only === false)).toBe(true);
      expect(countReadOnly(items, 5)).toBe(0);
    });
  });

  describe('over limit by 1', () => {
    it('flags the single oldest item read-only', () => {
      const items = [
        guide('newest', 6),
        guide('b', 5),
        guide('c', 4),
        guide('d', 3),
        guide('e', 2),
        guide('oldest', 1),
      ];

      const result = applyReadOnlyFlags(items, 5);

      expect(idsOf(result, i => i.is_read_only)).toEqual(['oldest']);
      expect(idsOf(result, i => !i.is_read_only)).toEqual(['b', 'c', 'd', 'e', 'newest']);
    });
  });

  describe('over limit by many', () => {
    it('flags all items beyond the limit, ranked by updated_at', () => {
      const items = [
        guide('a', 10),
        guide('b', 9),
        guide('c', 8),
        guide('d', 7),
        guide('e', 6),
        guide('f', 5),
        guide('g', 4),
        guide('h', 3),
        guide('i', 2),
        guide('j', 1),
      ];

      const result = applyReadOnlyFlags(items, 3);

      expect(idsOf(result, i => !i.is_read_only)).toEqual(['a', 'b', 'c']);
      expect(idsOf(result, i => i.is_read_only)).toEqual(['d', 'e', 'f', 'g', 'h', 'i', 'j']);
    });

    it('preserves the input order in the returned array', () => {
      const items = [
        guide('z', 1),  // oldest first in input
        guide('m', 5),
        guide('a', 9),  // newest last in input
      ];

      const result = applyReadOnlyFlags(items, 1);

      expect(result.map(i => i.id)).toEqual(['z', 'm', 'a']);
      expect(result.find(i => i.id === 'a').is_read_only).toBe(false);
      expect(result.find(i => i.id === 'm').is_read_only).toBe(true);
      expect(result.find(i => i.id === 'z').is_read_only).toBe(true);
    });
  });

  describe('unlimited (null limit)', () => {
    it('flags nothing when limit is null', () => {
      const items = Array.from({ length: 50 }, (_, n) => guide(`g-${n}`, n + 1));

      const result = applyReadOnlyFlags(items, null);

      expect(result.every(i => i.is_read_only === false)).toBe(true);
      expect(countReadOnly(items, null)).toBe(0);
    });

    it('flags nothing when limit is undefined', () => {
      const items = [guide('a', 3), guide('b', 2)];

      const result = applyReadOnlyFlags(items, undefined);

      expect(result.every(i => i.is_read_only === false)).toBe(true);
    });
  });

  describe('ranking semantics', () => {
    it('ranks by updated_at, not created_at, when both are present', () => {
      // 'old-but-edited' was created first but most recently updated.
      const items = [
        {
          id: 'old-but-edited',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
        },
        {
          id: 'new-and-untouched',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
        {
          id: 'middle',
          created_at: '2025-06-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
        },
      ];

      const result = applyReadOnlyFlags(items, 1);

      expect(result.find(i => i.id === 'old-but-edited').is_read_only).toBe(false);
      expect(result.find(i => i.id === 'new-and-untouched').is_read_only).toBe(true);
      expect(result.find(i => i.id === 'middle').is_read_only).toBe(true);
    });

    it('falls back to created_at when updated_at is missing', () => {
      const items = [
        { id: 'no-update-old', created_at: '2025-01-01T00:00:00Z' },
        { id: 'no-update-new', created_at: '2026-01-01T00:00:00Z' },
      ];

      const result = applyReadOnlyFlags(items, 1);

      expect(result.find(i => i.id === 'no-update-new').is_read_only).toBe(false);
      expect(result.find(i => i.id === 'no-update-old').is_read_only).toBe(true);
    });

    it('breaks ties on equal timestamps using id (deterministic)', () => {
      const sameTime = '2026-01-01T00:00:00Z';
      const items = [
        { id: 'a', updated_at: sameTime },
        { id: 'b', updated_at: sameTime },
        { id: 'c', updated_at: sameTime },
      ];

      const a = applyReadOnlyFlags(items, 1);
      const b = applyReadOnlyFlags(items, 1);

      // Same input, same flagging — no nondeterminism from sort order.
      expect(a.map(i => i.is_read_only)).toEqual(b.map(i => i.is_read_only));
      // Exactly one editable, two read-only.
      expect(a.filter(i => !i.is_read_only)).toHaveLength(1);
      expect(a.filter(i => i.is_read_only)).toHaveLength(2);
    });
  });

  describe('input safety', () => {
    it('returns an empty array for non-array input', () => {
      expect(applyReadOnlyFlags(null, 5)).toEqual([]);
      expect(applyReadOnlyFlags(undefined, 5)).toEqual([]);
      expect(applyReadOnlyFlags('not-an-array', 5)).toEqual([]);
    });

    it('does not mutate the input array or its items', () => {
      const items = [guide('a', 3), guide('b', 2), guide('c', 1)];
      const snapshot = JSON.parse(JSON.stringify(items));

      applyReadOnlyFlags(items, 1);

      expect(items).toEqual(snapshot);
    });

    it('treats negative limits as zero (everything read-only)', () => {
      const items = [guide('a', 3), guide('b', 2)];

      const result = applyReadOnlyFlags(items, -3);

      expect(result.every(i => i.is_read_only === true)).toBe(true);
    });
  });
});

describe('countReadOnly', () => {
  it('returns 0 under limit, the excess over limit, and 0 for unlimited', () => {
    const five = Array.from({ length: 5 }, (_, n) => guide(`g-${n}`, n + 1));

    expect(countReadOnly(five, 10)).toBe(0);
    expect(countReadOnly(five, 5)).toBe(0);
    expect(countReadOnly(five, 3)).toBe(2);
    expect(countReadOnly(five, 0)).toBe(5);
    expect(countReadOnly(five, null)).toBe(0);
  });
});

// Plan limits taken from src/lib/plans.js — keep in sync.
const PLAN_LIMITS = {
  free:   { active_guides: 5,  bundles: 2 },
  couple: { active_guides: 25, bundles: 10 },
  family: { active_guides: null, bundles: null }, // unlimited
};

describe('tier scenario integration', () => {
  describe('exactly at limit', () => {
    it('keeps every item editable on Free with exactly 5 guides', () => {
      const guides = Array.from({ length: 5 }, (_, n) => guide(`g-${n}`, n + 1));

      const result = applyReadOnlyFlags(guides, PLAN_LIMITS.free.active_guides);

      expect(result.every(g => !g.is_read_only)).toBe(true);
      expect(countReadOnly(guides, PLAN_LIMITS.free.active_guides)).toBe(0);
    });

    it('keeps every item editable on Free with exactly 2 bundles', () => {
      const bundles = Array.from({ length: 2 }, (_, n) => guide(`b-${n}`, n + 1));

      const result = applyReadOnlyFlags(bundles, PLAN_LIMITS.free.bundles);

      expect(result.every(b => !b.is_read_only)).toBe(true);
    });
  });

  describe('downgrade then create', () => {
    it('Couple → Free: 25 guides become 5 editable + 20 read-only, ranked by updated_at', () => {
      // Build 25 guides with strictly increasing updated_at (n=1 oldest, n=25 newest).
      const guides = Array.from({ length: 25 }, (_, n) => guide(`g-${n}`, n + 1));

      const result = applyReadOnlyFlags(guides, PLAN_LIMITS.free.active_guides);

      const editable = result.filter(g => !g.is_read_only);
      const readOnly = result.filter(g => g.is_read_only);
      expect(editable).toHaveLength(5);
      expect(readOnly).toHaveLength(20);

      // The 5 newest (n=21..25) stay editable.
      expect(editable.map(g => g.id).sort()).toEqual(
        ['g-20', 'g-21', 'g-22', 'g-23', 'g-24'].sort()
      );
    });

    it('after Couple → Free, the active count remains 25 (no auto-archive decrement)', () => {
      // Read-only doesn't reduce the count — it only flips a derived flag.
      // The count is still 25, so any GUIDE_CREATE entitlement check would
      // see 25 ≥ 5 and block creation. That's the "downgrade-then-create"
      // contract: the user must upgrade or delete before creating.
      const guides = Array.from({ length: 25 }, (_, n) => guide(`g-${n}`, n + 1));

      const flagged = applyReadOnlyFlags(guides, PLAN_LIMITS.free.active_guides);

      expect(flagged).toHaveLength(25);
      expect(countReadOnly(guides, PLAN_LIMITS.free.active_guides)).toBe(20);
    });
  });

  describe('upgrade restores edit on locked items', () => {
    it('Free → Couple: previously read-only guides become editable', () => {
      const guides = Array.from({ length: 10 }, (_, n) => guide(`g-${n}`, n + 1));

      const beforeUpgrade = applyReadOnlyFlags(guides, PLAN_LIMITS.free.active_guides);
      expect(beforeUpgrade.filter(g => g.is_read_only)).toHaveLength(5);

      const afterUpgrade = applyReadOnlyFlags(guides, PLAN_LIMITS.couple.active_guides);
      expect(afterUpgrade.every(g => !g.is_read_only)).toBe(true);
    });

    it('Couple → Family (unlimited): every item is editable', () => {
      const guides = Array.from({ length: 50 }, (_, n) => guide(`g-${n}`, n + 1));

      const beforeUpgrade = applyReadOnlyFlags(guides, PLAN_LIMITS.couple.active_guides);
      expect(beforeUpgrade.filter(g => g.is_read_only)).toHaveLength(25);

      const afterUpgrade = applyReadOnlyFlags(guides, PLAN_LIMITS.family.active_guides);
      expect(afterUpgrade.every(g => !g.is_read_only)).toBe(true);
    });

    it('the same guide that was locked is the same guide that becomes editable', () => {
      const guides = Array.from({ length: 8 }, (_, n) => guide(`g-${n}`, n + 1));

      const before = applyReadOnlyFlags(guides, PLAN_LIMITS.free.active_guides);
      const wasLocked = before.filter(g => g.is_read_only).map(g => g.id);
      expect(wasLocked).toHaveLength(3);

      // Upgrade to unlimited and verify the previously-locked guides
      // are now in the editable set (identity match, not just count).
      const after = applyReadOnlyFlags(guides, null);
      const nowEditable = new Set(after.filter(g => !g.is_read_only).map(g => g.id));
      for (const id of wasLocked) {
        expect(nowEditable.has(id)).toBe(true);
      }
    });
  });
});
