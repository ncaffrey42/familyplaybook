/**
 * Feedback plumbing: checkpoint triggers, submission, and the review-ask rule.
 *
 * Checkpoints ('setup', 'first_action') fire a window event; the mounted
 * FeedbackBubble listens and opens the sheet. Each prompts at most once per
 * user — locally via localStorage, and server-side via a unique index, so a
 * second device can't re-prompt.
 */
import { supabase } from '@/lib/supabaseClient';
import { isNative, nativePlatform } from '@/lib/native';

export const FEEDBACK_EVENT = 'fp-feedback-checkpoint';
const PROMPTED_KEY = (kind) => `fp_feedback_prompted_${kind}`;
const UP_COUNT_KEY = 'fp_feedback_up_count';
const REVIEW_ASKED_AT_KEY = 'fp_review_asked_at';
const REVIEW_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** Fire a checkpoint prompt (no-op if this device already prompted it). */
export function triggerCheckpoint(kind, delayMs = 2500) {
  try {
    if (localStorage.getItem(PROMPTED_KEY(kind))) return;
    localStorage.setItem(PROMPTED_KEY(kind), new Date().toISOString());
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT, { detail: { kind } }));
    }, delayMs);
  } catch { /* storage unavailable — skip quietly */ }
}

/** Submit feedback through the edge function. Returns { success, duplicate? }. */
export async function submitFeedback({ kind = 'bubble', rating = null, message = '' }) {
  const { data, error } = await supabase.functions.invoke('submit-feedback', {
    body: {
      kind,
      rating,
      message,
      route: window.location.pathname,
      platform: isNative() ? nativePlatform() : 'web',
      version: import.meta.env.VITE_APP_VERSION || null,
    },
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || 'Could not send feedback');
  return data;
}

/**
 * The review-ask rule: native only, store id configured, 2nd+ lifetime
 * thumbs-up, at most once per 90 days. Call AFTER recording a thumbs-up;
 * returns true when the gentle review ask should be shown.
 */
export function shouldAskForReview() {
  try {
    if (!isNative()) return false;
    const iosConfigured = !!import.meta.env.VITE_APPSTORE_ID;
    const isIos = nativePlatform() === 'ios';
    if (isIos && !iosConfigured) return false; // Play Store uses the package id — always known

    const ups = parseInt(localStorage.getItem(UP_COUNT_KEY) || '0', 10);
    if (ups < 2) return false;

    const askedAt = Date.parse(localStorage.getItem(REVIEW_ASKED_AT_KEY) || '');
    if (!Number.isNaN(askedAt) && Date.now() - askedAt < REVIEW_COOLDOWN_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export function recordThumbsUp() {
  try {
    const ups = parseInt(localStorage.getItem(UP_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(UP_COUNT_KEY, String(ups));
  } catch { /* ignore */ }
}

export function markReviewAsked() {
  try { localStorage.setItem(REVIEW_ASKED_AT_KEY, new Date().toISOString()); } catch { /* ignore */ }
}

/** Open the platform store's review surface. */
export async function openStoreReview() {
  const url = nativePlatform() === 'ios'
    ? `itms-apps://itunes.apple.com/app/id${import.meta.env.VITE_APPSTORE_ID}?action=write-review`
    : `market://details?id=com.familyplaybook.app`;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch {
    window.open(url, '_blank');
  }
}
