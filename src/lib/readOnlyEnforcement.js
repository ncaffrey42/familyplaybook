/**
 * Tier-limit read-only derivation.
 *
 * When a user has more guides (or bundles) than their current plan allows,
 * the N most recently *updated* items stay editable and the rest are flagged
 * read-only. The flag is *derived*, not stored — it is recomputed every time
 * data is fetched and matched by Supabase RLS policies on the server.
 *
 * Ordering rule: updated_at DESC, with created_at as a fallback for items
 * that don't yet have an updated_at, then id DESC as a deterministic
 * tiebreaker so the same set of items always produces the same ranking.
 *
 * Plan limits live in src/lib/plans.js. A null limit means unlimited
 * (Family plan) — nothing is read-only.
 */

const NULLISH_LIMIT = -1;

function getRankTime(item) {
  const raw = item?.updated_at || item?.created_at;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function compareForRank(a, b) {
  const aTime = getRankTime(a);
  const bTime = getRankTime(b);
  if (aTime !== bTime) return bTime - aTime;
  const aId = String(a?.id ?? '');
  const bId = String(b?.id ?? '');
  if (aId !== bId) return bId.localeCompare(aId);
  return 0;
}

/**
 * Returns a new array of items, each with an `is_read_only` boolean.
 * Does not mutate the input.
 *
 * @param {Array<{id: any, updated_at?: string, created_at?: string}>} items
 * @param {number|null|undefined} planLimit
 *   The plan's max for this resource type. `null` / `undefined` = unlimited.
 * @returns {Array<object>} items with `is_read_only` set
 */
export function applyReadOnlyFlags(items, planLimit) {
  if (!Array.isArray(items) || items.length === 0) return [];

  if (planLimit === null || planLimit === undefined) {
    return items.map(item => ({ ...item, is_read_only: false }));
  }

  const limit = Math.max(0, Math.floor(Number(planLimit)));
  if (!Number.isFinite(limit) || limit === NULLISH_LIMIT) {
    return items.map(item => ({ ...item, is_read_only: false }));
  }

  const ranked = [...items].sort(compareForRank);
  const editableIds = new Set(
    ranked.slice(0, limit).map(item => item?.id).filter(id => id !== undefined)
  );

  return items.map(item => ({
    ...item,
    is_read_only: !editableIds.has(item?.id),
  }));
}

/**
 * Convenience: count how many items in the list are read-only given a limit.
 * Equivalent to applyReadOnlyFlags(...).filter(i => i.is_read_only).length
 * but avoids the array allocation for callers that only need the count.
 */
export function countReadOnly(items, planLimit) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  if (planLimit === null || planLimit === undefined) return 0;
  const limit = Math.max(0, Math.floor(Number(planLimit)));
  if (!Number.isFinite(limit)) return 0;
  return Math.max(0, items.length - limit);
}
