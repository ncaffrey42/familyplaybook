/**
 * Pure, dependency-free decision helpers for stripe-webhook idempotency and
 * event ordering. Deliberately free of Deno / Stripe / Supabase imports so they
 * can be unit-tested directly. index.ts wires these to the database.
 */

/**
 * True when an event should be applied to a billing row: its created time is not
 * older than the last event already applied to that row.
 *
 * - A row with no prior event (null/undefined `lastEventAt`) always passes.
 * - Equal timestamps pass — re-applying the same point-in-time state is
 *   idempotent and safe, and Stripe can legitimately emit events that share a
 *   second-granular `created` value.
 *
 * Returning false means the incoming event is stale (arrived out of order) and
 * must be dropped so it can't overwrite fresher state.
 */
export function isEventFresh(
  lastEventAt: string | null | undefined,
  eventCreatedAt: string,
): boolean {
  if (!lastEventAt) return true;
  return new Date(eventCreatedAt).getTime() >= new Date(lastEventAt).getTime();
}
