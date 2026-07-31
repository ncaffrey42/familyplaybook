/**
 * Freshness check: keep the playbook trustworthy, quietly.
 *
 * Picks AT MOST ONE of the user's own guides that hasn't been touched or
 * confirmed in 90+ days, preferring safety-critical content. Shown at most
 * once per two weeks (device cadence), snoozable per guide for 30 days
 * (stored server-side in user_dismissals so it holds across devices).
 * In-app only — a user who doesn't open the app is never contacted.
 */

export const STALE_DAYS = 90;
export const CADENCE_DAYS = 14;
export const SNOOZE_DAYS = 30;

const CADENCE_KEY = 'fp_freshness_last_prompt';

// Safety-critical wording gets checked first — these are the guides that are
// worst to have wrong when a helper actually needs them.
const SAFETY_WORDS = /emergency|allerg|medic|doctor|pediatric|poison|911|epipen|first.?aid|contact/i;

const lastTouched = (g) => {
  const stamps = [g.updated_at, g.last_confirmed_at, g.created_at]
    .filter(Boolean)
    .map((t) => new Date(t).getTime());
  return stamps.length ? Math.max(...stamps) : 0;
};

/**
 * Choose the freshness candidate, or null.
 * @param guides   the user's guides (shared-with-me items are excluded here)
 * @param snoozes  Set of guide ids snoozed within SNOOZE_DAYS
 * @param now      injectable clock for tests
 */
export function pickFreshnessCandidate(guides, snoozes = new Set(), now = new Date()) {
  const cutoff = now.getTime() - STALE_DAYS * 864e5;
  const stale = (guides || [])
    .filter((g) => !g.is_shared_with_me)
    .filter((g) => !snoozes.has(g.id))
    .filter((g) => lastTouched(g) > 0 && lastTouched(g) < cutoff);

  if (stale.length === 0) return null;

  const safety = stale.filter((g) => SAFETY_WORDS.test(`${g.name} ${g.description || ''}`));
  const pool = safety.length > 0 ? safety : stale;
  // stalest first
  pool.sort((a, b) => lastTouched(a) - lastTouched(b));
  return pool[0];
}

/** Device-level cadence: at most one prompt per two weeks. */
export function cadenceAllows(now = new Date()) {
  try {
    const last = Date.parse(localStorage.getItem(CADENCE_KEY) || '');
    return Number.isNaN(last) || now.getTime() - last > CADENCE_DAYS * 864e5;
  } catch {
    return false;
  }
}

export function markPrompted(now = new Date()) {
  try { localStorage.setItem(CADENCE_KEY, now.toISOString()); } catch { /* ignore */ }
}

/** Human "hasn't changed since March" style label. */
export function staleSinceLabel(guide) {
  const t = lastTouched(guide);
  if (!t) return '';
  return new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
