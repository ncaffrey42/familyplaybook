/**
 * Share-link expiry: the three duration presets from the design brief and
 * the math behind them. All computations use the OWNER's local clock — the
 * babysitter's "tonight" is the family's tonight.
 *
 *   tonight   → closes at the next local midnight
 *   weekend   → closes Sunday 8pm local (if it's already past that, next Sunday)
 *   until_off → never closes on its own (expires_at = null)
 */

export const EXPIRY_PRESETS = [
  { key: 'tonight', label: 'Tonight', detail: 'Closes itself at midnight' },
  { key: 'weekend', label: 'This weekend', detail: 'Until Sunday 8pm' },
  { key: 'until_off', label: 'Until I switch it off', detail: 'Stays live until you turn it off' },
];

/** ISO timestamp for a preset, or null for until_off. `now` injectable for tests. */
export function computeExpiry(preset, now = new Date()) {
  if (preset === 'until_off') return null;

  if (preset === 'tonight') {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0); // next local midnight
    return d.toISOString();
  }

  if (preset === 'weekend') {
    const d = new Date(now);
    const daysToSunday = (7 - d.getDay()) % 7; // 0 if today is Sunday
    d.setDate(d.getDate() + daysToSunday);
    d.setHours(20, 0, 0, 0); // Sunday 8pm local
    if (d <= now) d.setDate(d.getDate() + 7); // past this week's window → next
    return d.toISOString();
  }

  return null;
}

/**
 * Host stays don't fit "tonight" or "the weekend" — a guest checks out on a
 * date. `custom` carries that date; the link closes at the END of it
 * (23:59:59.999 local), so a checkout-day guest keeps access all day.
 */
export function expiryFromDateInput(value) {
  if (!value) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999); // local, end of that day
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** `expires_at` → a `yyyy-mm-dd` value for <input type="date">, in local time. */
export function dateInputFromExpiry(expiresAt) {
  if (!expiresAt) return '';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Best-matching preset for an existing expires_at (for showing selection).
 *
 * `allowCustom` is opt-in and defaults to FALSE so this keeps its original
 * behaviour for every existing caller. With only three presets, the fuzzy
 * "under 26h ⇒ tonight, else weekend" rule was always right — every link
 * was one of the three. Once arbitrary dates exist that stops holding, so
 * callers that offer a date picker pass `allowCustom: true` and get
 * 'custom' for anything that isn't an exact preset match. Exact matching
 * is the only way to tell "picked Tonight" from "picked a custom date that
 * happens to be tonight" — the durations overlap.
 */
export function presetFromExpiry(expiresAt, now = new Date(), { allowCustom = false } = {}) {
  if (!expiresAt) return 'until_off';
  if (!allowCustom) {
    const diffH = (new Date(expiresAt) - now) / 36e5;
    return diffH <= 26 ? 'tonight' : 'weekend';
  }

  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return 'until_off';
  if (exp.getTime() === new Date(computeExpiry('tonight', now)).getTime()) return 'tonight';
  if (exp.getTime() === new Date(computeExpiry('weekend', now)).getTime()) return 'weekend';
  return 'custom';
}

export function isExpired(expiresAt, now = new Date()) {
  return !!expiresAt && new Date(expiresAt) <= now;
}

/** "closes in 3h" / "closes in 2d" / "until you switch it off" / "ended". */
export function humanizeExpiry(expiresAt, now = new Date()) {
  if (!expiresAt) return 'until you switch it off';
  const ms = new Date(expiresAt) - now;
  if (ms <= 0) return 'ended';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `closes in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `closes in ${hours}h`;
  return `closes in ${Math.round(hours / 24)}d`;
}
