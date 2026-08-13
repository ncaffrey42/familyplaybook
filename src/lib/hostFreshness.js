/**
 * Host freshness — the family freshness loop (src/lib/freshness.js) pointed at
 * host content, with one added dimension: SEASON.
 *
 * A pool guide last edited in January is not "stale" by the 90-day clock in
 * June — but it is exactly the guide a host should re-check before summer
 * guests arrive. Seasonal content decays against the calendar, not just the
 * clock. This module adds that; everything else (at-most-one, snooze via
 * user_dismissals, in-app only, silence-is-default) is the family loop's
 * behavior, reused by the owner-loop surface that consumes this.
 *
 * Pure and deterministic — no network, no AI, testable in isolation
 * (see src/__tests__/hostFreshness.test.js). Design: ALFRED_OWNER_LOOP.md §4.
 */

export const STALE_DAYS = 90; // matches family freshness.js

/**
 * Seasonal topics → the season the content is USED in. A pool guide matters
 * in summer; a heating guide in winter. Keyword match over name+description,
 * same deterministic approach as gapDetection / hostCoverage.
 */
const SEASONAL = [
  { season: 'summer', match: /pool|beach|a\/c|air.?con|patio|garden|bbq|barbec|sunscreen|kayak|paddle/i },
  { season: 'winter', match: /heating|heater|furnace|fireplace|firewood|snow|ski|de.?ic|salt|shovel|frozen pipe/i },
  { season: 'autumn', match: /leaves|gutter|rake|storm shutter/i },
  { season: 'spring',  match: /pollen|allerg|garden prep|mow/i },
];

const SEASON_ORDER = ['winter', 'spring', 'summer', 'autumn'];

const lastTouched = (g) => {
  const stamps = [g.updated_at, g.last_confirmed_at, g.created_at]
    .filter(Boolean)
    .map((t) => new Date(t).getTime());
  return stamps.length ? Math.max(...stamps) : 0;
};

/**
 * Meteorological season for a date.
 * @param hemisphere 'north' (default) | 'south' — the southern hemisphere's
 *   seasons are offset by six months. A property's real hemisphere should
 *   come from its address eventually (ALFRED_OWNER_LOOP.md §4.1 records this
 *   as a known limitation); until then the caller passes it, default north.
 */
export function currentSeason(now = new Date(), hemisphere = 'north') {
  const m = now.getMonth(); // 0=Jan
  // Northern: Dec-Feb winter, Mar-May spring, Jun-Aug summer, Sep-Nov autumn.
  const north = m <= 1 || m === 11 ? 'winter'
    : m <= 4 ? 'spring'
    : m <= 7 ? 'summer'
    : 'autumn';
  if (hemisphere === 'north') return north;
  // Southern hemisphere: opposite season.
  const opposite = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };
  return opposite[north];
}

/** The season a guide's content belongs to, or null if it isn't seasonal. */
export function guideSeason(guide) {
  const hay = `${guide.name || ''} ${guide.description || ''}`;
  const hit = SEASONAL.find((s) => s.match.test(hay));
  return hit ? hit.season : null;
}

const seasonOf = (ts) => (ts ? currentSeason(new Date(ts)) : null);

/**
 * Pick at most one host guide worth re-checking, or null. Season-stale beats
 * clock-stale: a seasonal guide whose season is arriving and that was last
 * touched in a different season is the highest-value nudge (the "pool guide,
 * last touched in winter" case). Falls back to the plain 90-day staleness for
 * non-seasonal content so the loop still covers an old check-in guide.
 *
 * @param guides   the property's guides (caller scopes to one property)
 * @param snoozes  Set of guide ids snoozed within the snooze window
 * @param now      injectable clock
 * @param hemisphere 'north' | 'south'
 */
export function pickHostFreshnessCandidate(guides, snoozes = new Set(), now = new Date(), hemisphere = 'north') {
  const live = (guides || []).filter((g) => g && !snoozes.has(g.id) && lastTouched(g) > 0);
  const nowSeason = currentSeason(now, hemisphere);

  // 1. Season-stale: seasonal, its season is HERE, last touched in another
  //    season. These are time-sensitive in a way the clock can't see.
  const seasonStale = live
    .map((g) => ({ g, season: guideSeason(g) }))
    .filter(({ season }) => season && season === nowSeason)
    .filter(({ g, season }) => seasonOf(lastTouched(g)) !== season);

  if (seasonStale.length > 0) {
    // stalest first
    seasonStale.sort((a, b) => lastTouched(a.g) - lastTouched(b.g));
    return { ...seasonStale[0].g, _reason: 'season', _season: seasonStale[0].season };
  }

  // 2. Fall back to plain clock staleness (90+ days), stalest first.
  const cutoff = now.getTime() - STALE_DAYS * 864e5;
  const clockStale = live
    .filter((g) => lastTouched(g) < cutoff)
    .sort((a, b) => lastTouched(a) - lastTouched(b));

  return clockStale.length > 0 ? { ...clockStale[0], _reason: 'stale' } : null;
}

export { SEASON_ORDER };
