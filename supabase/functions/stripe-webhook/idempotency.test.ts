// Run: deno test supabase/functions/stripe-webhook/idempotency.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { isEventFresh } from './idempotency.ts';

const T1 = '2024-01-01T00:00:00.000Z'; // earlier
const T2 = '2024-06-01T00:00:00.000Z'; // later

Deno.test('isEventFresh: a row with no prior event always accepts', () => {
  assertEquals(isEventFresh(null, T1), true);
  assertEquals(isEventFresh(undefined, T1), true);
});

Deno.test('isEventFresh: a newer event is fresh', () => {
  assertEquals(isEventFresh(T1, T2), true);
});

Deno.test('isEventFresh: an older event is stale', () => {
  assertEquals(isEventFresh(T2, T1), false);
});

Deno.test('isEventFresh: an equal-timestamp event is accepted (idempotent re-apply)', () => {
  assertEquals(isEventFresh(T1, T1), true);
});
