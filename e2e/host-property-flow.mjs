#!/usr/bin/env node
/**
 * E2E for the host property flow.  docs/platform/PROPERTIES.md §5.
 *
 * ⚠️ THIS HAS NEVER BEEN RUN. Nothing is applied or deployed — migrations
 * 20240128–20240131 exist only as files in supabase/migrations/, and no test
 * user has been created. Treat the first run as data collection, not as a
 * regression check — expect to fix this script as much as the feature.
 *
 * WHAT IT DRIVES — entirely Supabase REST/RPC (no edge functions, no browser):
 *
 *   sign in                     password grant for a disposable test user
 *   seed check (§5 step 0)      content_categories host rows === HOST_CATEGORIES
 *   create property (step 1)    insert packs → insert properties (1:1 bundle)
 *   build guide (step 2)        insert guides (host category) + pack_guides
 *   dated guest link (step 3)   shared_links w/ checkout-day expiry + label,
 *                               plus a per-guide link — get_shared_content's
 *                               bundle branch (supabase/schema.sql ~l.561) only
 *                               lists guides that have their OWN share link
 *   guest view (step 4)         anon get_shared_content → bundle w/ the guide
 *   expires (step 5)            owner PATCHes expires_at into the past (this
 *                               exercises shared_links_owner_update, migration
 *                               20240128's silent-expiry bugfix), then anon
 *                               sees {type:'expired'} and ask_playbook_available
 *                               is false (or 404 → WARN: 20240129 not applied)
 *   cleanup (step 6)            best-effort deletes in reverse order
 *
 * ENV (all required):
 *   SUPABASE_URL       https://<project-ref>.supabase.co
 *   SUPABASE_ANON_KEY  the project's anon key
 *   E2E_EMAIL          a DISPOSABLE test user — never a real account
 *   E2E_PASSWORD       that user's password
 *
 * EXIT CODES:
 *   0  every non-WARN step passed
 *   1  a step failed
 *   2  a prerequisite is missing (a migration is not applied, or the test
 *      user cannot sign in) — distinct so callers can tell "not ready"
 *      from "broken"
 *
 * Requires Node 18+ for global fetch. No dependencies, by design — same
 * pattern as evals/ask-playbook/run.mjs: runnable from a laptop with nothing
 * installed.
 */

import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ setup */

function die(message, code = 1) {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(code);
}

if (typeof fetch !== 'function') {
  die(
    [
      'This script needs Node 18 or newer (it uses global fetch).',
      `You are on ${process.version}.`,
      '',
      'Try:  nvm use 20 && node e2e/host-property-flow.mjs',
    ].join('\n')
  );
}

const ENV_HELP = [
  'The host property flow E2E needs a Supabase project and a disposable test user.',
  '',
  'Missing environment:',
  '  {{MISSING}}',
  '',
  'To set them up:',
  '  1. In the Supabase dashboard: Authentication → Users → Add user →',
  '     "Create new user". Use a throwaway address and password, and tick',
  '     "Auto Confirm User" (the password grant cannot sign in an unconfirmed',
  '     user). NEVER point this at a real account: the script inserts and',
  '     deletes rows in it, and a failed run can leave test rows behind.',
  '  2. Then:',
  '',
  '     SUPABASE_URL=https://<project-ref>.supabase.co \\',
  '     SUPABASE_ANON_KEY=<anon key> \\',
  '     E2E_EMAIL=<test user email> \\',
  '     E2E_PASSWORD=<test user password> \\',
  '       node e2e/host-property-flow.mjs',
  '',
  'The anon key is safe to use here: it is the same key every guest-facing',
  'page ships to the browser. All privileged steps go through the signed-in',
  'test user; the guest steps deliberately use the anon key alone.',
  '',
  'Exit codes: 0 = flow passed · 1 = a step failed · 2 = a prerequisite',
  '(migration / test user) is missing.',
].join('\n');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'E2E_EMAIL', 'E2E_PASSWORD'];
const missingEnv = REQUIRED_ENV.filter((k) => !String(process.env[k] || '').trim());
if (missingEnv.length) {
  die(ENV_HELP.replace('{{MISSING}}', missingEnv.join('\n  ')), 1);
}

const SUPABASE_URL = process.env.SUPABASE_URL.trim().replace(/\/+$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY.trim();
const E2E_EMAIL = process.env.E2E_EMAIL.trim();
const E2E_PASSWORD = process.env.E2E_PASSWORD;

/**
 * Hard-coded mirror of src/lib/hostTaxonomy.js → HOST_CATEGORIES ids, in
 * order. Deliberately NOT imported: the whole point of the seed check is
 * drift detection between three copies of this list — the migration seed
 * (supabase/migrations/20240130_properties_host_taxonomy.sql), the client
 * constant (src/lib/hostTaxonomy.js), and this expectation. Importing one
 * copy would make two of them the same copy.
 */
const EXPECTED_HOST_CATEGORIES = ['Arrival', 'House', 'Local', 'Departure'];

/* ---------------------------------------------------------------- helpers */

/** A step failure with an exit code: 1 = test failure, 2 = missing prereq. */
class StepError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}
const prereq = (message) => new StepError(message, 2);

/** A non-fatal finding: recorded, printed, does not fail the run. */
class Warn extends Error {}

/**
 * One REST/RPC call. `apikey` is ALWAYS sent; `Authorization: Bearer` only
 * when a token is given — the guest steps rely on omitting it.
 */
async function rest(path, { method = 'GET', token = null, body, prefer } = {}) {
  const headers = { apikey: ANON_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure (DNS, refused, TLS): a prerequisite problem, not
    // a test failure — and worth a clean message, not an undici stack trace.
    // Probe before concluding the backend is down; a wrong SUPABASE_URL and a
    // paused project look identical from here.
    const cause = (err && err.cause && err.cause.code) || (err && err.message) || String(err);
    throw prereq(
      `Could not reach ${SUPABASE_URL} (${cause}).\n` +
        '  Check SUPABASE_URL (https://<project-ref>.supabase.co), your network,\n' +
        '  and that the project is not paused.'
    );
  }
  const raw = await res.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null; // non-JSON body; keep raw for error messages
  }
  return { status: res.status, ok: res.ok, body: parsed, raw };
}

const errText = (res) =>
  `HTTP ${res.status} ${res.raw ? res.raw.slice(0, 300) : '(empty body)'}`;

/** Table absent: PostgREST answers 404 (PGRST205 / 42P01-style). */
function isMissingRelation(res) {
  const code = res.body && res.body.code;
  return res.status === 404 || code === '42P01' || code === 'PGRST205';
}

/** Column absent from the schema cache (PGRST204) or from the table (42703). */
function isMissingColumn(res, column) {
  const code = res.body && res.body.code;
  const msg = String((res.body && res.body.message) || res.raw || '');
  return (code === 'PGRST204' || code === '42703') && msg.includes(column);
}

/** RPC function absent: 404 / PGRST202 / 42883. */
function isMissingFunction(res) {
  const code = res.body && res.body.code;
  return res.status === 404 || code === 'PGRST202' || code === '42883';
}

/**
 * Assert an insert actually returned a row. Every insert here sends
 * `Prefer: return=representation`, so a 2xx with an empty body means RLS
 * silently matched nothing — the exact failure mode documented in
 * docs/platform/SHARING.md §2 (PostgREST reports success, supabase-js reports
 * `error: null`, and nothing happened). This codebase has been bitten by it;
 * never trust a bare 201 from a table with RLS.
 */
function assertReturnedRow(res, table, implicated) {
  if (!res.ok) {
    throw new StepError(
      `INSERT into ${table} failed: ${errText(res)}` +
        (implicated ? `\n  likely: ${implicated}` : '')
    );
  }
  const rows = Array.isArray(res.body) ? res.body : res.body ? [res.body] : [];
  if (!rows.length || !rows[0].id) {
    throw new StepError(
      [
        `INSERT into ${table} answered ${res.status} but returned NO row despite`,
        'Prefer: return=representation. That is RLS silently matching nothing',
        `(docs/platform/SHARING.md §2). Check ${table}'s INSERT and SELECT policies.`,
      ].join('\n  ')
    );
  }
  return rows[0];
}

/* ------------------------------------------------------------------ state */

let token = null;
let userId = null;

/** Everything created, so cleanup can run even after a mid-flow failure. */
const created = {
  packId: null,
  propertyId: null,
  guideId: null,
  packGuideLinked: false,
  bundleLinkId: null,
  guideLinkId: null,
};

/* ------------------------------------------------------------------ steps */

/**
 * §5 step 1 runs BEFORE the §5 step 0 seed check: content_categories grants
 * SELECT to `authenticated` only, and under RLS an anon read returns [] (a
 * filter, not an error) — which would misreport a healthy seed as missing.
 */
async function stepSignIn() {
  const res = await rest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  if (!res.ok || !res.body || !res.body.access_token) {
    throw prereq(
      [
        `Could not sign in as ${E2E_EMAIL}: ${errText(res)}`,
        'The test user is a prerequisite. Create a disposable user in the',
        'Supabase dashboard (Authentication → Users → Add user, tick',
        '"Auto Confirm User") — never a real account.',
      ].join('\n  ')
    );
  }
  token = res.body.access_token;

  const who = await rest('/auth/v1/user', { token });
  if (!who.ok || !who.body || !who.body.id) {
    throw new StepError(`GET /auth/v1/user failed after sign-in: ${errText(who)}`);
  }
  userId = who.body.id;
  return `signed in as ${E2E_EMAIL}`;
}

/** §5 step 0 — the seed and src/lib/hostTaxonomy.js must not drift. */
async function stepSeedCheck() {
  const res = await rest(
    '/rest/v1/content_categories?workspace_type=eq.host&select=key&order=sort_order.asc',
    { token }
  );
  if (isMissingRelation(res)) {
    throw prereq(
      'content_categories does not exist — migration 20240130 not applied.\n' +
        `  (${errText(res)})`
    );
  }
  if (!res.ok || !Array.isArray(res.body)) {
    throw new StepError(`Reading content_categories failed: ${errText(res)}`);
  }
  const got = res.body.map((r) => r.key);
  if (got.join('|') !== EXPECTED_HOST_CATEGORIES.join('|')) {
    throw new StepError(
      [
        'Host taxonomy drift.',
        `expected (in order): [${EXPECTED_HOST_CATEGORIES.join(', ')}]`,
        `got:                 [${got.join(', ') || 'no rows'}]`,
        'One of these changed without the others:',
        '  supabase/migrations/20240130_properties_host_taxonomy.sql (the seed)',
        '  src/lib/hostTaxonomy.js HOST_CATEGORIES (the client mirror)',
        '  e2e/host-property-flow.mjs EXPECTED_HOST_CATEGORIES (this file)',
      ].join('\n  ')
    );
  }
  return got.join(', ');
}

/** §5 step 1 (second half) — insert bundle, then the property over it. */
async function stepCreateProperty() {
  const packRes = await rest('/rest/v1/packs', {
    method: 'POST',
    token,
    prefer: 'return=representation',
    body: { user_id: userId, name: 'E2E Test Property' },
  });
  const pack = assertReturnedRow(packRes, 'packs', 'packs owner INSERT policy');
  created.packId = pack.id;

  const propRes = await rest('/rest/v1/properties', {
    method: 'POST',
    token,
    prefer: 'return=representation',
    body: {
      user_id: userId,
      bundle_id: created.packId,
      name: 'E2E Test Property',
      address: '1 Test Lane',
    },
  });
  if (isMissingRelation(propRes)) {
    throw prereq(
      'properties does not exist — migration 20240130 not applied.\n' +
        `  (${errText(propRes)})`
    );
  }
  const prop = assertReturnedRow(
    propRes,
    'properties',
    'properties_owner_insert policy (migration 20240130)'
  );
  created.propertyId = prop.id;
  return `pack ${created.packId} + property ${created.propertyId}`;
}

/** §5 step 2 — a guide in a host category, linked into the bundle. */
async function stepBuildGuide() {
  const guideRes = await rest('/rest/v1/guides', {
    method: 'POST',
    token,
    prefer: 'return=representation',
    body: {
      user_id: userId,
      name: 'E2E Wifi',
      category: 'House',
      // Explicit even though the column defaults true: get_shared_content's
      // bundle listing filters on COALESCE(is_shareable, FALSE), so this is
      // load-bearing for the guest-view step, not decoration.
      is_shareable: true,
      steps: [{ id: randomUUID(), text: 'The wifi is ⟨name⟩', image_url: '', video_url: '' }],
    },
  });
  const guide = assertReturnedRow(guideRes, 'guides', 'guides owner INSERT policy');
  created.guideId = guide.id;

  const linkRes = await rest('/rest/v1/pack_guides', {
    method: 'POST',
    token,
    prefer: 'return=representation',
    body: { pack_id: created.packId, guide_id: created.guideId, position: 1 },
  });
  if (!linkRes.ok) {
    throw new StepError(
      `INSERT into pack_guides failed: ${errText(linkRes)}\n` +
        '  likely: pack_guides INSERT policy'
    );
  }
  const linkRows = Array.isArray(linkRes.body) ? linkRes.body : [];
  if (!linkRows.length) {
    throw new StepError(
      'INSERT into pack_guides returned no row despite return=representation —\n' +
        '  RLS silently matched nothing (docs/platform/SHARING.md §2).'
    );
  }
  created.packGuideLinked = true;
  return `guide ${created.guideId} (category House) linked into bundle`;
}

/** §5 step 3 — dated bundle link + the per-guide link the listing requires. */
async function stepDatedGuestLink() {
  // Checkout = end of day two days from now, LOCAL time — replicating
  // src/lib/shareExpiry.js → expiryFromDateInput: the link closes at
  // 23:59:59.999 local on the checkout date, so a checkout-day guest keeps
  // access all day. Local, not UTC, on purpose: the owner's clock rules.
  const base = new Date();
  base.setDate(base.getDate() + 2);
  const checkout = new Date(
    base.getFullYear(), base.getMonth(), base.getDate(),
    23, 59, 59, 999
  );

  const bundleLinkRes = await rest('/rest/v1/shared_links', {
    method: 'POST',
    token,
    prefer: 'return=representation',
    body: {
      user_id: userId,
      bundle_id: created.packId,
      expires_at: checkout.toISOString(),
      recipient_label: 'E2E stay',
    },
  });
  if (isMissingColumn(bundleLinkRes, 'recipient_label')) {
    throw prereq(
      'shared_links.recipient_label does not exist — migration 20240128 not applied.\n' +
        `  (${errText(bundleLinkRes)})`
    );
  }
  const bundleLink = assertReturnedRow(
    bundleLinkRes,
    'shared_links',
    'shared_links owner INSERT policy (migration 20240109)'
  );
  created.bundleLinkId = bundleLink.id;

  // Per-guide link. get_shared_content's bundle branch (supabase/schema.sql,
  // the JOIN LATERAL on shared_links sl2 WHERE sl2.guide_id = g.id) lists
  // ONLY guides that have their own share link — without this row,
  // bundle_guides comes back empty and step 4 fails for the wrong reason.
  // No expires_at: the lateral join ignores expiry on the per-guide link.
  const guideLinkRes = await rest('/rest/v1/shared_links', {
    method: 'POST',
    token,
    prefer: 'return=representation',
    body: { user_id: userId, guide_id: created.guideId },
  });
  const guideLink = assertReturnedRow(
    guideLinkRes,
    'shared_links',
    'shared_links owner INSERT policy (migration 20240109)'
  );
  created.guideLinkId = guideLink.id;

  return `bundle link ${created.bundleLinkId} (expires ${checkout.toISOString()}), guide link ${created.guideLinkId}`;
}

/** §5 step 4 — the guest surface, with ONLY the anon key. */
async function stepGuestView() {
  // No token — a guest has nothing but the link. The apikey header alone
  // puts PostgREST in the anon role; get_shared_content is SECURITY DEFINER
  // and granted to anon.
  const res = await rest('/rest/v1/rpc/get_shared_content', {
    method: 'POST',
    body: { p_share_id: created.bundleLinkId },
  });
  if (isMissingFunction(res)) {
    throw prereq(
      'get_shared_content is missing — the base schema (supabase/schema.sql) is not applied.\n' +
        `  (${errText(res)})`
    );
  }
  if (!res.ok || !res.body) {
    throw new StepError(`get_shared_content failed as anon: ${errText(res)}`);
  }
  if (res.body.type !== 'bundle') {
    throw new StepError(
      `get_shared_content type: expected 'bundle', got '${res.body.type}'\n` +
        `  full response: ${res.raw.slice(0, 300)}`
    );
  }
  const guides = Array.isArray(res.body.bundle_guides) ? res.body.bundle_guides : [];
  const wifi = guides.find((g) => g.name === 'E2E Wifi');
  if (!wifi) {
    throw new StepError(
      [
        "bundle_guides does not include 'E2E Wifi'.",
        `got: [${guides.map((g) => g.name).join(', ') || 'empty'}]`,
        'get_shared_content lists only shareable guides that have their OWN',
        'share link (JOIN LATERAL on shared_links in supabase/schema.sql) —',
        'check that the per-guide link from the previous step really inserted,',
        'and that the guide is is_shareable.',
      ].join('\n  ')
    );
  }
  if (wifi.shareId !== created.guideLinkId) {
    throw new StepError(
      `bundle_guides shareId: expected the per-guide link ${created.guideLinkId}, ` +
        `got ${wifi.shareId} — get_shared_content picked a different shared_links row`
    );
  }
  return `bundle '${res.body.bundle && res.body.bundle.name}' lists E2E Wifi via its per-guide link`;
}

/** §5 step 5a — the owner-side UPDATE that migration 20240128 makes possible. */
async function stepOwnerExpires() {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const res = await rest(`/rest/v1/shared_links?id=eq.${created.bundleLinkId}`, {
    method: 'PATCH',
    token,
    prefer: 'return=representation',
    body: { expires_at: anHourAgo },
  });
  if (!res.ok) {
    throw new StepError(`PATCH shared_links.expires_at failed: ${errText(res)}`);
  }
  const rows = Array.isArray(res.body) ? res.body : [];
  if (!rows.length) {
    // THE silent-expiry bug, resurrected: with RLS on and no UPDATE policy,
    // Postgres matches zero rows and PostgREST reports success anyway.
    throw prereq(
      [
        'PATCH answered success but updated ZERO rows.',
        'The shared_links_owner_update policy is MISSING — migration 20240128',
        'is not (fully) applied. This is exactly the silent-expiry bug that',
        'docs/platform/SHARING.md §2 documents: the client believes expiry',
        'changed and it never did. Do not ship until this policy exists.',
      ].join('\n  ')
    );
  }
  return `expires_at moved to ${anHourAgo} (1 row, owner_update policy works)`;
}

/** §5 step 5b — an expired link shows the guest nothing but 'expired'. */
async function stepGuestSeesExpired() {
  const res = await rest('/rest/v1/rpc/get_shared_content', {
    method: 'POST',
    body: { p_share_id: created.bundleLinkId },
  });
  if (!res.ok || !res.body) {
    throw new StepError(`get_shared_content (expired) failed as anon: ${errText(res)}`);
  }
  if (res.body.type !== 'expired') {
    throw new StepError(
      `expected {type:'expired'}, got: ${res.raw.slice(0, 300)}\n` +
        '  an expired link must not leak content (supabase/schema.sql, get_shared_content)'
    );
  }
  return "anon sees {type:'expired'}";
}

/** §5 step 5c — Ask must be off for an expired link. WARN if not deployed. */
async function stepAskPlaybookOff() {
  const res = await rest('/rest/v1/rpc/ask_playbook_available', {
    method: 'POST',
    body: { p_share_id: created.bundleLinkId },
  });
  if (isMissingFunction(res)) {
    throw new Warn(
      'ask_playbook_available does not exist — migration 20240129 not applied. ' +
        'WARN only: Ask the Playbook is not a prerequisite for the property flow.'
    );
  }
  if (!res.ok) {
    throw new StepError(`ask_playbook_available failed: ${errText(res)}`);
  }
  if (res.body !== false) {
    throw new StepError(
      `ask_playbook_available on an EXPIRED link: expected false, got ${res.raw.slice(0, 120)}\n` +
        '  resolve_ask_scope must refuse expired links (migration 20240129)'
    );
  }
  return 'false, as an expired link requires';
}

/* ---------------------------------------------------------------- cleanup */

/**
 * §5 step 6 — best-effort, in reverse creation order, and it runs even when
 * an earlier step threw. Order matters at the end: properties references
 * packs with ON DELETE RESTRICT, so the property row must go before its pack.
 * Failures here are WARNs (with the leftover ids printed loudly), not test
 * failures — but leftovers in the test account should be deleted by hand.
 */
async function cleanup() {
  if (!token) {
    record('cleanup', 'skip', 'never signed in; nothing was created');
    return;
  }
  const problems = [];
  const remove = async (label, path) => {
    try {
      const res = await rest(path, { method: 'DELETE', token, prefer: 'return=representation' });
      if (!res.ok) {
        problems.push(`${label}: ${errText(res)}`);
      } else if (!(Array.isArray(res.body) && res.body.length)) {
        problems.push(`${label}: 0 rows deleted (already gone, or DELETE policy missing)`);
      }
    } catch (err) {
      problems.push(`${label}: ${err.message}`);
    }
  };

  if (created.bundleLinkId) {
    await remove('shared_links (bundle link)', `/rest/v1/shared_links?id=eq.${created.bundleLinkId}`);
  }
  if (created.guideLinkId) {
    await remove('shared_links (guide link)', `/rest/v1/shared_links?id=eq.${created.guideLinkId}`);
  }
  if (created.packGuideLinked) {
    await remove(
      'pack_guides',
      `/rest/v1/pack_guides?pack_id=eq.${created.packId}&guide_id=eq.${created.guideId}`
    );
  }
  if (created.guideId) {
    await remove('guides', `/rest/v1/guides?id=eq.${created.guideId}`);
  }
  if (created.propertyId) {
    await remove('properties', `/rest/v1/properties?id=eq.${created.propertyId}`);
  }
  if (created.packId) {
    await remove('packs', `/rest/v1/packs?id=eq.${created.packId}`);
  }

  const touched = Object.values(created).some(Boolean);
  if (!touched) {
    record('cleanup', 'skip', 'nothing was created');
  } else if (problems.length) {
    record('cleanup', 'warn', `leftovers may remain — ${problems.join('; ')}`);
  } else {
    record('cleanup', 'pass', 'all E2E rows deleted');
  }
}

/* -------------------------------------------------------------- reporting */

const STEPS = [];
function record(name, status, detail = '') {
  STEPS.push({ name, status, detail });
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);

function printSummary() {
  process.stdout.write(`\n${'='.repeat(96)}\n`);
  process.stdout.write('HOST PROPERTY FLOW — SUMMARY\n');
  process.stdout.write(`${'='.repeat(96)}\n`);
  process.stdout.write(`${pad('step', 22)}${pad('status', 8)}detail\n`);
  process.stdout.write(`${'-'.repeat(96)}\n`);
  for (const s of STEPS) {
    const firstLine = String(s.detail).split('\n')[0];
    process.stdout.write(`${pad(s.name, 22)}${pad(s.status.toUpperCase(), 8)}${firstLine.slice(0, 66)}\n`);
  }
  const noisy = STEPS.filter((s) => (s.status === 'fail' || s.status === 'warn') && s.detail);
  if (noisy.length) {
    process.stdout.write(`\n${'-'.repeat(96)}\n`);
    for (const s of noisy) {
      process.stdout.write(`\n${s.status.toUpperCase()} — ${s.name}\n  ${s.detail.replace(/\n/g, '\n  ')}\n`);
    }
  }
}

/* ------------------------------------------------------------------- main */

const PLAN = [
  ['sign-in', stepSignIn],
  ['seed-check', stepSeedCheck],
  ['create-property', stepCreateProperty],
  ['build-guide', stepBuildGuide],
  ['dated-guest-link', stepDatedGuestLink],
  ['guest-view', stepGuestView],
  ['owner-expires', stepOwnerExpires],
  ['guest-sees-expired', stepGuestSeesExpired],
  ['ask-playbook-off', stepAskPlaybookOff],
];

async function main() {
  process.stdout.write(`Host property flow E2E against ${SUPABASE_URL}\n`);
  process.stdout.write(`Test user: ${E2E_EMAIL}\n\n`);

  let worstExit = 0;
  let aborted = false;

  for (const [name, fn] of PLAN) {
    if (aborted) {
      record(name, 'skip', 'an earlier step failed');
      process.stdout.write(`  ${pad(name, 20)} skip\n`);
      continue;
    }
    process.stdout.write(`  ${pad(name, 20)} … `);
    try {
      const detail = await fn();
      record(name, 'pass', detail || '');
      process.stdout.write('ok\n');
    } catch (err) {
      if (err instanceof Warn) {
        record(name, 'warn', err.message);
        process.stdout.write('WARN\n');
      } else if (err instanceof StepError) {
        record(name, 'fail', err.message);
        worstExit = err.exitCode;
        aborted = true;
        process.stdout.write('FAIL\n');
      } else {
        record(name, 'fail', `unexpected: ${err && err.stack ? err.stack : err}`);
        worstExit = 1;
        aborted = true;
        process.stdout.write('FAIL\n');
      }
    }
  }

  await cleanup();
  printSummary();

  const planNames = new Set(PLAN.map(([name]) => name));
  const planSteps = STEPS.filter((s) => planNames.has(s.name));
  const count = (status) => planSteps.filter((s) => s.status === status).length;
  const failed = STEPS.filter((s) => s.status === 'fail');
  const exitCode = worstExit || (failed.length ? 1 : 0);
  process.stdout.write(
    `\n${count('pass')}/${PLAN.length} steps passed` +
      `${count('warn') ? `, ${count('warn')} WARN` : ''}` +
      `${count('fail') ? `, ${count('fail')} FAILED` : ''}` +
      `${count('skip') ? `, ${count('skip')} skipped` : ''}\n`
  );
  if (exitCode === 2) {
    process.stdout.write(
      'A prerequisite is missing — the FAIL detail above names it (a migration,\n' +
        'the test user, or connectivity). Fix that and re-run; nothing else failed.\n'
    );
  } else if (!exitCode) {
    process.stdout.write('Host property flow works end to end.\n');
  }
  process.exit(exitCode);
}

main().catch((err) => die(`Runner crashed: ${err && err.stack ? err.stack : err}`));
