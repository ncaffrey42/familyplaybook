import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.quicktime', '.m4v'];

export function isVideoUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.includes(ext));
}

/**
 * Returns true when `path` is safe to navigate to as an in-app route.
 *
 * Used by the upgrade-and-return flow to validate `?returnTo=` so a hostile
 * link can't redirect the user to a foreign origin or trigger a JS scheme
 * after they complete checkout.
 *
 * Internal = single-leading-slash path with no scheme and no protocol-relative
 * prefix. We deliberately do not follow up with a router-level existence check
 * — bad routes will just render the 404 page, which is recoverable.
 */
export function isInternalPath(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (!path.startsWith('/')) return false;
  // Reject protocol-relative URLs (//evil.com) and Windows path tricks (/\evil)
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  // Reject anything that contains a scheme, e.g. /javascript:foo, /data:...,
  // or a stray http://. The colon-after-letters pattern catches these.
  if (/^\/+[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return false;
  if (/[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path)) return false;
  return true;
}
/**
 * Make a non-button element behave like a button for keyboard users.
 *
 * A `<div onClick>` is invisible to anyone not using a mouse: it takes no
 * focus and fires on no key. Spreading this onto the element gives it the
 * three things a real button has — a role, a tab stop, and Enter/Space
 * activation — without changing any styling.
 *
 * Prefer an actual `<button>` in new code. This exists for the places where
 * swapping the element would mean re-doing the layout, and is enforced by
 * jsx-a11y/no-static-element-interactions.
 */
export const keyboardClickable = (onClick) => ({
  role: 'button',
  tabIndex: 0,
  onClick,
  onKeyDown: (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Space scrolls the page by default; Enter can submit an enclosing form.
    e.preventDefault();
    onClick?.(e);
  },
});
