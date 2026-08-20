/**
 * Checklist progress — surviving a backgrounded app.
 *
 * Step checkboxes were pure React state, so tabbing away mid-morning-routine
 * lost your place. Progress is kept in localStorage keyed by guide + local
 * calendar day: a checklist is a thing you do *today*, so tomorrow starts
 * fresh on its own rather than needing a "start over" tap.
 *
 * This is deliberately client-only. Helper mode uses it too — a guest's ticks
 * stay on the guest's device and never touch the owner's data.
 */

const PREFIX = 'fp:checklist:';
const KEEP_DAYS = 7;

/** Local calendar day, not UTC — a 9pm checklist belongs to that evening. */
export const dayKey = (now = new Date()) => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const storageKey = (scopeId, now) => `${PREFIX}${scopeId}:${dayKey(now)}`;

// Private browsing and storage-disabled contexts throw on access. Progress is
// a convenience, never a correctness requirement, so every path degrades to
// in-memory state rather than breaking the screen.
const safeStorage = () => {
  try {
    const s = window.localStorage;
    if (!s) return null;
    return s;
  } catch {
    return null;
  }
};

/**
 * Read today's checked step ids for a guide.
 * Returns [] for anything missing, stale or malformed.
 */
export const loadProgress = (scopeId, now = new Date()) => {
  if (!scopeId) return [];
  const store = safeStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(storageKey(scopeId, now));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Persist today's checked step ids. An empty list clears the entry. */
export const saveProgress = (scopeId, checked, now = new Date()) => {
  if (!scopeId) return;
  const store = safeStorage();
  if (!store) return;
  try {
    const key = storageKey(scopeId, now);
    if (!Array.isArray(checked) || checked.length === 0) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, JSON.stringify(checked));
  } catch {
    // Quota or private mode — the screen still works, it just won't resume.
  }
};

/**
 * Drop entries older than KEEP_DAYS so a heavy user's storage doesn't grow
 * without bound. Cheap enough to run on mount.
 */
export const pruneProgress = (now = new Date()) => {
  const store = safeStorage();
  if (!store) return;
  try {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    const cutoffKey = dayKey(cutoff);
    const doomed = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const day = key.slice(key.lastIndexOf(':') + 1);
      // ISO day strings compare correctly as strings.
      if (day < cutoffKey) doomed.push(key);
    }
    doomed.forEach((key) => store.removeItem(key));
  } catch {
    // Nothing to do — pruning is housekeeping, not behaviour.
  }
};
