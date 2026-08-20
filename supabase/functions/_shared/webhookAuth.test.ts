// Tests for the webhook shared-secret gate.
//
//   deno test --no-check --allow-env --allow-net --node-modules-dir=none \
//     supabase/functions/_shared/webhookAuth.test.ts
//
// This gate is the ONLY thing standing between the public internet and
// revenuecat-webhook, which writes user_billing — i.e. it decides what plan
// a user is on. It lived inside index.ts until 2026-08-20, where nothing
// could reach it: index.ts calls Deno.serve() at module load, so importing
// it in a test starts a server. Extracted here for exactly that reason.
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { secretsMatch } from './webhookAuth.ts';

const SECRET = 'rc_whsec_9f2b41c8a7d3e05f';

Deno.test('an identical secret authenticates', async () => {
  assert(await secretsMatch(SECRET, SECRET));
});

Deno.test('a wrong secret of the same length is rejected', async () => {
  const wrong = SECRET.slice(0, -1) + 'X';
  assertEquals(wrong.length, SECRET.length);
  assertFalse(await secretsMatch(wrong, SECRET));
});

Deno.test('a correct prefix is not enough', async () => {
  // The failure mode a timing attack exploits: guessing byte by byte. Every
  // one of these must be as wrong as any other.
  for (let i = 1; i < SECRET.length; i++) {
    assertFalse(await secretsMatch(SECRET.slice(0, i), SECRET));
  }
});

Deno.test('a secret with extra trailing data is rejected', async () => {
  assertFalse(await secretsMatch(SECRET + 'extra', SECRET));
});

Deno.test('case differences are rejected', async () => {
  assertFalse(await secretsMatch(SECRET.toUpperCase(), SECRET));
});

// The env-var cases. `Deno.env.get` on an unset variable returns undefined,
// and a header that was not sent is null — neither may ever authenticate.
Deno.test('a missing expected secret never authenticates', async () => {
  assertFalse(await secretsMatch(SECRET, undefined));
  assertFalse(await secretsMatch(SECRET, null));
  assertFalse(await secretsMatch(SECRET, ''));
});

Deno.test('a missing presented secret never authenticates', async () => {
  assertFalse(await secretsMatch(undefined, SECRET));
  assertFalse(await secretsMatch(null, SECRET));
  assertFalse(await secretsMatch('', SECRET));
});

Deno.test('both missing does NOT authenticate', async () => {
  // The dangerous shape: if an unset env var compared equal to an absent
  // header, an unconfigured deployment would accept every request.
  assertFalse(await secretsMatch(undefined, undefined));
  assertFalse(await secretsMatch('', ''));
  assertFalse(await secretsMatch(null, null));
});

Deno.test('unicode and long secrets compare correctly', async () => {
  const uni = 'sécret-🔐-ключ';
  assert(await secretsMatch(uni, uni));
  assertFalse(await secretsMatch(uni, uni + '.'));

  const long = 'x'.repeat(10_000);
  assert(await secretsMatch(long, long));
  assertFalse(await secretsMatch(long, 'x'.repeat(9_999) + 'y'));
});
