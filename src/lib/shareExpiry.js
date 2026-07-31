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

/** Best-matching preset for an existing expires_at (for showing selection). */
export function presetFromExpiry(expiresAt, now = new Date()) {
  if (!expiresAt) return 'until_off';
  const diffH = (new Date(expiresAt) - now) / 36e5;
  return diffH <= 26 ? 'tonight' : 'weekend';
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
