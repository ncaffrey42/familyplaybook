/**
 * Shared-secret authentication for webhooks that cannot present a Supabase
 * JWT. Pure and side-effect free, so it can be unit-tested directly — the
 * same split that keeps revenuecat-webhook's mapping.ts testable while
 * index.ts calls Deno.serve() at module load.
 *
 * Used by revenuecat-webhook (REVENUECAT_WEBHOOK_AUTH). Stripe does not need
 * it — Stripe signs its payloads, which is strictly stronger.
 */
import { timingSafeEqual } from 'jsr:@std/crypto@1/timing-safe-equal';

/**
 * Compare two secrets without leaking information through response timing.
 *
 * `===` on strings short-circuits at the first differing byte, so an attacker
 * who can time our responses can recover the secret one byte at a time.
 * timingSafeEqual requires equal-length inputs, so both sides are SHA-256'd
 * first: that fixes the length at 32 bytes, which also removes the length of
 * the presented secret as an observable.
 *
 * Returns false for null/undefined/empty on either side — a missing secret
 * must never authenticate, which matters because an unset env var reads as
 * undefined rather than throwing.
 */
export async function secretsMatch(
  presented: string | null | undefined,
  expected: string | null | undefined,
): Promise<boolean> {
  if (!presented || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(presented)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}
