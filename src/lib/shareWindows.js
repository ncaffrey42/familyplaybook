/**
 * Share windows — how long a link stays live.
 *
 * The design brief offers three durations: Tonight, This weekend, and
 * "Until I switch it off". Every boundary is computed in the OWNER's local
 * time, because "tonight" means their evening, not UTC's.
 *
 * `expires_at === null` means forever — the link is live until it's turned off.
 * That is also what every link created before timed links existed carries, so
 * the null case must always read as live, never as expired.
 */

export const SHARE_WINDOW_TONIGHT = 'tonight';
export const SHARE_WINDOW_WEEKEND = 'weekend';
export const SHARE_WINDOW_FOREVER = 'forever';

/** End of the current local day — 23:59:59.999 tonight. */
const endOfToday = (now) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * End of the coming weekend — Sunday 20:00 local.
 * On a Sunday before 8pm that's tonight; from Sunday 8pm onwards it rolls to
 * the following Sunday, so the option never resolves to a time already past.
 */
const endOfWeekend = (now) => {
  const d = new Date(now);
  const daysUntilSunday = (7 - d.getDay()) % 7; // 0 when today is Sunday
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(20, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
};

export const SHARE_WINDOWS = [
  {
    id: SHARE_WINDOW_TONIGHT,
    label: 'Tonight',
    hint: 'Closes itself at midnight',
    expiryFor: (now = new Date()) => endOfToday(now),
  },
  {
    id: SHARE_WINDOW_WEEKEND,
    label: 'This weekend',
    hint: 'Until Sunday evening',
    expiryFor: (now = new Date()) => endOfWeekend(now),
  },
  {
    id: SHARE_WINDOW_FOREVER,
    label: 'Until I switch it off',
    hint: 'For a regular sitter or a live-in',
    expiryFor: () => null,
  },
];

/** Compute the expiry a window id resolves to, as an ISO string or null. */
export const expiryForWindow = (windowId, now = new Date()) => {
  const w = SHARE_WINDOWS.find((x) => x.id === windowId);
  if (!w) return null;
  const expiry = w.expiryFor(now);
  return expiry ? expiry.toISOString() : null;
};

/** A link with no expiry is live; otherwise it's live until its expiry passes. */
export const isLive = (link, now = new Date()) => {
  if (!link?.expires_at) return true;
  return new Date(link.expires_at) > now;
};

/**
 * Which preset a stored expiry corresponds to, so the picker can show the
 * owner's existing choice. Anything that isn't recognisably one of the presets
 * still reads as a real window — it just isn't preselected.
 */
export const windowIdFor = (expiresAt, now = new Date()) => {
  if (!expiresAt) return SHARE_WINDOW_FOREVER;
  const t = new Date(expiresAt).getTime();
  if (t === endOfToday(now).getTime()) return SHARE_WINDOW_TONIGHT;
  if (t === endOfWeekend(now).getTime()) return SHARE_WINDOW_WEEKEND;
  return null;
};

const timeLabel = (d) =>
  d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(':00', '')
    .toLowerCase()
    .replace(/\s/g, '');

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * How the window reads to a person: "until midnight", "until 8pm Sunday",
 * "until you turn it off", "closed". Sentence-fragment case so it can be
 * dropped into a line of copy.
 */
export const describeWindow = (link, now = new Date()) => {
  if (!link?.expires_at) return 'until you turn it off';
  const expiry = new Date(link.expires_at);
  if (expiry <= now) return 'closed';

  // 23:59-ish reads as midnight, not "11:59pm".
  const endsAtMidnight = expiry.getHours() === 23 && expiry.getMinutes() >= 59;
  if (isSameDay(expiry, now)) {
    return endsAtMidnight ? 'until midnight' : `until ${timeLabel(expiry)}`;
  }

  const weekday = expiry.toLocaleDateString(undefined, { weekday: 'long' });
  return endsAtMidnight
    ? `until midnight ${weekday}`
    : `until ${timeLabel(expiry)} ${weekday}`;
};

/** Short form for a section label: "TONIGHT · UNTIL MIDNIGHT". */
export const windowLabel = (link, now = new Date()) => {
  if (!link?.expires_at) return 'Shared with you';
  const expiry = new Date(link.expires_at);
  if (expiry <= now) return 'Closed';
  const prefix = isSameDay(expiry, now) ? 'Tonight' : 'Shared with you';
  return `${prefix} · ${describeWindow(link, now)}`;
};
