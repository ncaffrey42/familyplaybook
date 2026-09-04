#!/usr/bin/env node
/**
 * Eval runner for "Ask the Playbook" / Alfred.  ASK_PLAYBOOK.md §9.
 *
 * ⚠️ THIS HAS NEVER BEEN RUN. Nothing is deployed, no migration is applied and
 * there is no OpenAI key in this environment (ASK_PLAYBOOK.md §10). Everything
 * below is written and unexecuted. Treat the first run as data collection, not
 * as a regression check — expect to fix this script as much as the feature.
 *
 * ITS FIRST JOB IS TO CALIBRATE `SIMILARITY_THRESHOLD`.
 * That constant (supabase/functions/_shared/askPlaybook.ts, currently 0.35) is
 * an uncalibrated guess, and it is the number that decides whether a stressed
 * babysitter gets an answer or a refusal. The REFUSAL BOUNDARY report at the
 * bottom of this script's output is what it should be set from:
 *
 *   false-positive refusals (an in-scope question was refused)
 *       → threshold is too TIGHT  → raise it
 *   false-negative refusals (an out-of-scope question was answered)
 *       → threshold is too LOOSE  → lower it
 *
 * Sweep it: set the constant, redeploy, re-run, keep the value that drives
 * false negatives to zero first (answering something you shouldn't is worse
 * than refusing something you could have answered) and then minimises false
 * positives. Do not enable the feature flag until this has been done.
 *
 * SETUP
 *   1. Create the household in `cases.json` → `seed` as one owner's guides,
 *      verbatim. Verbatim matters: the seed text is the corpus for the
 *      invented-specifics scan.
 *   2. Share all of them as ONE bundle. The owner must be on a paid plan
 *      (ASK_PLAYBOOK.md §3, decision #2) or every request comes back ineligible.
 *   3. Take the share id out of the resulting /share/:shareId URL.
 *
 *   ASK_PLAYBOOK_URL=https://<project-ref>.supabase.co/functions/v1/ask-playbook \
 *   SUPABASE_ANON_KEY=<anon key> \
 *   EVAL_SHARE_ID=<share id> \
 *     node evals/ask-playbook/run.mjs
 *
 * Optional:
 *   EVAL_GUIDE_MAP=./map.json  {"g-firstaid":"<real uuid>", ...} — exact source
 *                              matching. Without it the runner falls back to
 *                              matching returned source names against the seed.
 *   EVAL_DELAY_MS=400          pause between questions.
 *   EVAL_ONLY=c01,c14          run a subset.
 *
 * RATE LIMIT: 20 questions / hour / share link (ASK_PLAYBOOK.md §3, decision
 * #3) and this file holds more cases than that. Pass EVAL_SHARE_ID as a
 * comma-separated list of share ids over the same bundle and the runner
 * rotates through them; otherwise run it in batches with EVAL_ONLY.
 *
 * Requires Node 18+ for global fetch. No dependencies, by design — this must
 * be runnable from a laptop with nothing installed.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(HERE, 'cases.json');

/* ------------------------------------------------------------------ setup */

function die(message) {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

if (typeof fetch !== 'function') {
  die(
    [
      'This runner needs Node 18 or newer (it uses global fetch).',
      `You are on ${process.version}.`,
      '',
      'Try:  nvm use 20 && node evals/ask-playbook/run.mjs',
    ].join('\n')
  );
}

const ENV_HELP = [
  'Ask the Playbook evals need a deployed function and a real share link.',
  '',
  'Missing environment:',
  '  {{MISSING}}',
  '',
  'To set them up:',
  '  1. Seed the household. Every guide under `seed.guides` in',
  '     evals/ask-playbook/cases.json, created under one owner, text verbatim.',
  '     The runner compares answers against that text to catch invented',
  '     phone numbers and codes, so paraphrasing produces false alarms.',
  '  2. That owner must be on a paid plan — Ask is paid-owners-only',
  '     (ASK_PLAYBOOK.md §3, decision #2).',
  '  3. Share all of the seed guides as ONE bundle, and copy the share id out',
  '     of the /share/:shareId URL you get back.',
  '  4. Then:',
  '',
  '     ASK_PLAYBOOK_URL=https://<project-ref>.supabase.co/functions/v1/ask-playbook \\',
  '     SUPABASE_ANON_KEY=<your anon key> \\',
  '     EVAL_SHARE_ID=<share id from the URL> \\',
  '       node evals/ask-playbook/run.mjs',
  '',
  'The anon key is fine to use here: this endpoint is an anonymous surface by',
  'design. Scope is resolved server-side from the share id (ASK_PLAYBOOK.md §2).',
  '',
  'Note the 20 questions / hour / share link limit. This file has more cases',
  'than that — pass several share ids over the same bundle, comma-separated, or',
  'run in batches with EVAL_ONLY=c01,c02,...',
].join('\n');

const missing = ['ASK_PLAYBOOK_URL', 'SUPABASE_ANON_KEY', 'EVAL_SHARE_ID'].filter(
  (k) => !String(process.env[k] || '').trim()
);
if (missing.length) {
  die(ENV_HELP.replace('{{MISSING}}', missing.join('\n  ')));
}

const URL_ = process.env.ASK_PLAYBOOK_URL.trim();
const ANON_KEY = process.env.SUPABASE_ANON_KEY.trim();
const SHARE_IDS = process.env.EVAL_SHARE_ID.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DELAY_MS = Number(process.env.EVAL_DELAY_MS || 400);
const ONLY = String(process.env.EVAL_ONLY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let suite;
try {
  suite = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
} catch (err) {
  die(`Could not read ${CASES_PATH}\n  ${err.message}`);
}

const SEED_GUIDES = (suite.seed && suite.seed.guides) || [];
const ALL_CASES = suite.cases || [];
const CASES = ONLY.length ? ALL_CASES.filter((c) => ONLY.includes(c.id)) : ALL_CASES;

if (!SEED_GUIDES.length || !CASES.length) {
  die(`${CASES_PATH} has no seed guides or no cases matching EVAL_ONLY.`);
}

let GUIDE_MAP = {};
if (process.env.EVAL_GUIDE_MAP) {
  try {
    GUIDE_MAP = JSON.parse(readFileSync(resolve(process.cwd(), process.env.EVAL_GUIDE_MAP), 'utf8'));
  } catch (err) {
    die(`Could not read EVAL_GUIDE_MAP\n  ${err.message}`);
  }
}

/* --------------------------------------------------------- the seed corpus */

function guideText(g) {
  const steps = Array.isArray(g.steps) ? g.steps : [];
  return [g.name, g.description, ...steps.flatMap((s) => [s.title, s.text, s.description, s.content])]
    .filter((v) => typeof v === 'string')
    .join('\n');
}

const CORPUS = SEED_GUIDES.map(guideText).join('\n');
/** All digits, separators stripped. Permissive on purpose: "(415) 555-0118"
 *  must still match an answer that writes it "415-555-0118" or "4155550118". */
const CORPUS_DIGITS = CORPUS.replace(/\D+/g, '');
const CORPUS_SQUASHED = CORPUS.toLowerCase().replace(/\s+/g, '');

/**
 * Anything in a *grounded* answer that looks like a specific the model could
 * have made up: a run of 3+ digits (phone numbers, alarm codes, years), a
 * dose with a unit, or an alphanumeric code token. ASK_PLAYBOOK.md §6:
 * "never invent phone numbers, doses, codes, addresses, names or times".
 */
function inventedSpecifics(answer) {
  const text = String(answer || '');
  const found = [];
  const flag = (token, why) => found.push({ token: String(token).trim(), why });

  // Phone-shaped: digits with separators, 7+ digits once stripped. Kept
  // separate from bare runs so "count to 3, 2, 1" cannot look like a number.
  for (const raw of text.match(/\+?\d[\d\s().-]{5,}\d/g) || []) {
    const digits = raw.replace(/\D+/g, '');
    if (digits.length >= 7 && !CORPUS_DIGITS.includes(digits)) {
      flag(raw, 'phone-shaped, in no seed guide');
    }
  }

  // Bare runs of 3+ digits: alarm codes, PINs, door codes, years. Two-digit
  // runs are skipped deliberately — clock times and temperatures are noise.
  for (const raw of text.match(/\d{3,}/g) || []) {
    if (!CORPUS_DIGITS.includes(raw)) flag(raw, `${raw.length}-digit run in no seed guide`);
  }

  for (const raw of text.match(/\d+(?:\.\d+)?\s*(?:mg|ml|mcg|kg|tsp|tbsp|cc|iu|units?)\b/gi) || []) {
    if (!CORPUS_SQUASHED.includes(raw.toLowerCase().replace(/\s+/g, ''))) {
      flag(raw, 'dose in no seed guide');
    }
  }

  // Shouted alphanumeric codes: A1B2, 4K7Z. Uppercase-only to avoid matching
  // ordinary words with a digit stuck to them ("8:35pm").
  for (const raw of text.match(/\b(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{4,}\b/g) || []) {
    if (/^\d+(?:AM|PM)$/.test(raw)) continue;
    if (!CORPUS_SQUASHED.includes(raw.toLowerCase())) flag(raw, 'code-shaped token in no seed guide');
  }

  const seen = new Set();
  return found.filter((f) => (seen.has(f.token) ? false : seen.add(f.token)));
}

/* --------------------------------------------------------- source matching */

/** The function returns guide ids; the seed uses logical ids. Bridge both. */
function aliasesFor(logicalId) {
  const guide = SEED_GUIDES.find((g) => g.id === logicalId);
  const out = [logicalId];
  if (GUIDE_MAP[logicalId]) out.push(GUIDE_MAP[logicalId]);
  if (guide && guide.name) out.push(guide.name);
  return out.map((s) => String(s).toLowerCase().trim()).filter(Boolean);
}

/** Sources may be ids, or objects. Flatten to comparable strings. */
function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .flatMap((s) => {
      if (typeof s === 'string') return [s];
      if (s && typeof s === 'object') {
        return [s.id, s.guide_id, s.name, s.guide_name, s.title].filter((v) => typeof v === 'string');
      }
      return [];
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

function citesExpected(sources, expectedLogicalId) {
  const aliases = aliasesFor(expectedLogicalId);
  return normalizeSources(sources).some((raw) => {
    const s = raw.toLowerCase();
    // Substring matching only for tokens long enough to be meaningful, so a
    // one-character source cannot match every guide in the seed.
    return aliases.some((a) => s === a || (s.length >= 4 && a.length >= 4 && (s.includes(a) || a.includes(s))));
  });
}

/* ----------------------------------------------------------------- the run */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let shareCursor = 0;
let askedOnCurrentShare = 0;
const RATE_LIMIT_PER_HOUR = 20;

async function ask(question) {
  const shareId = SHARE_IDS[shareCursor];
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ share_id: shareId, question }),
  });

  askedOnCurrentShare += 1;
  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  if (res.status === 429) {
    if (shareCursor < SHARE_IDS.length - 1) {
      shareCursor += 1;
      askedOnCurrentShare = 0;
      process.stdout.write(`  … rate limited, rotating to share id #${shareCursor + 1}\n`);
      await sleep(DELAY_MS);
      return ask(question);
    }
    die(
      [
        `Rate limited (429) after ${askedOnCurrentShare} questions on the last share id.`,
        `The limit is ${RATE_LIMIT_PER_HOUR} questions / hour / share link (ASK_PLAYBOOK.md §3).`,
        '',
        'Either wait an hour, or pass more share ids over the same bundle:',
        '  EVAL_SHARE_ID=<id1>,<id2>',
        'or run in batches:',
        '  EVAL_ONLY=c01,c02,c03',
      ].join('\n')
    );
  }

  if (!res.ok) {
    return { httpError: `HTTP ${res.status} ${(raw || '').slice(0, 200)}`, shareId };
  }
  if (!body || typeof body !== 'object') {
    return { httpError: `unparseable response: ${(raw || '').slice(0, 200)}`, shareId };
  }
  return { body, shareId };
}

function evaluate(testCase, body) {
  const grounded = body.grounded === true;
  const answer = typeof body.answer === 'string' ? body.answer : '';
  const sources = normalizeSources(body.sources);
  const failures = [];

  if (testCase.kind === 'in_scope') {
    if (!grounded) {
      failures.push('refused an in-scope question');
    } else {
      if (!citesExpected(body.sources, testCase.expect_source)) {
        failures.push(`cited [${sources.join(', ') || 'nothing'}], expected ${testCase.expect_source}`);
      }
      if (!answer.trim()) failures.push('grounded but the answer was empty');
    }
  } else if (grounded) {
    failures.push(`answered instead of refusing: "${answer.slice(0, 120)}"`);
  }

  // The invented-specifics scan applies to every grounded answer, including
  // ones that already failed for another reason.
  const invented = grounded ? inventedSpecifics(answer) : [];
  for (const item of invented) {
    failures.push(`INVENTED ${item.token} (${item.why})`);
  }

  return { grounded, answer, sources, invented, failures, pass: failures.length === 0 };
}

function distanceOf(body) {
  for (const key of ['top_distance', 'best_distance', 'distance', 'min_distance']) {
    if (typeof body[key] === 'number') return body[key];
  }
  return null;
}

/* -------------------------------------------------------------- reporting */

const pad = (s, n) => String(s).padEnd(n).slice(0, n);

function printSummary(results) {
  process.stdout.write(`\n${'='.repeat(96)}\n`);
  process.stdout.write('RESULTS\n');
  process.stdout.write(`${'='.repeat(96)}\n`);
  process.stdout.write(
    `${pad('case', 6)}${pad('kind', 14)}${pad('expected', 10)}${pad('got', 10)}${pad('dist', 7)}${pad('ok', 5)}detail\n`
  );
  process.stdout.write(`${'-'.repeat(96)}\n`);

  for (const r of results) {
    const got = r.error ? 'error' : r.grounded ? 'grounded' : 'refusal';
    const detail = r.error || r.failures.join(' | ') || (r.sources || []).join(', ');
    process.stdout.write(
      pad(r.case.id, 6) +
        pad(r.case.kind, 14) +
        pad(r.case.expect, 10) +
        pad(got, 10) +
        pad(r.distance === null || r.distance === undefined ? '—' : r.distance.toFixed(3), 7) +
        pad(r.pass ? 'PASS' : 'FAIL', 5) +
        detail +
        '\n'
    );
  }
}

function printInvented(results) {
  const offenders = results.filter((r) => (r.invented || []).length);
  if (!offenders.length) {
    process.stdout.write('\nInvented specifics: none. No phone number, dose or code appeared\n');
    process.stdout.write('that is not in the seed guides verbatim.\n');
    return;
  }
  process.stdout.write(`\n${'!'.repeat(96)}\n`);
  process.stdout.write('!! FABRICATION — the model produced specifics that are in no seed guide.\n');
  process.stdout.write('!! This is the failure mode that gets a child the wrong dose or the wrong\n');
  process.stdout.write('!! phone number. It is not tunable with a threshold; it is a prompt or\n');
  process.stdout.write('!! model problem (ASK_PLAYBOOK.md §6).\n');
  process.stdout.write(`${'!'.repeat(96)}\n`);
  for (const r of offenders) {
    process.stdout.write(`\n  ${r.case.id} (${r.case.kind}) "${r.case.question}"\n`);
    for (const item of r.invented) {
      process.stdout.write(`    → ${item.token}   [${item.why}]\n`);
    }
    process.stdout.write(`    answer: ${r.answer}\n`);
  }
}

function printRefusalBoundary(results) {
  const scored = results.filter((r) => !r.error);
  const shouldRefuse = (r) => r.case.kind !== 'in_scope';

  const tp = scored.filter((r) => shouldRefuse(r) && !r.grounded); // refused, correctly
  const fp = scored.filter((r) => !shouldRefuse(r) && !r.grounded); // refused an answerable question
  const fn = scored.filter((r) => shouldRefuse(r) && r.grounded); // answered something it should not have
  const tn = scored.filter((r) => !shouldRefuse(r) && r.grounded); // answered, correctly

  const precision = tp.length + fp.length ? tp.length / (tp.length + fp.length) : 0;
  const recall = tp.length + fn.length ? tp.length / (tp.length + fn.length) : 0;
  const pct = (n) => `${(n * 100).toFixed(1)}%`;

  process.stdout.write(`\n${'='.repeat(96)}\n`);
  process.stdout.write('REFUSAL BOUNDARY — this is what SIMILARITY_THRESHOLD is tuned against\n');
  process.stdout.write(`${'='.repeat(96)}\n`);
  process.stdout.write('Positive class = "refused". Threshold is a cosine DISTANCE cutoff, so a\n');
  process.stdout.write('LARGER threshold answers more and refuses less.\n\n');
  process.stdout.write(`  true positives   ${pad(tp.length, 4)} correctly refused\n`);
  process.stdout.write(`  true negatives   ${pad(tn.length, 4)} correctly answered\n`);
  process.stdout.write(`  false positives  ${pad(fp.length, 4)} OVER-refusal — an in-scope question got nothing\n`);
  process.stdout.write(`  false negatives  ${pad(fn.length, 4)} UNDER-refusal — answered outside the playbook\n`);
  process.stdout.write(`\n  refusal precision ${pct(precision)}   refusal recall ${pct(recall)}\n`);

  if (fp.length) {
    process.stdout.write('\n  Over-refused (threshold too TIGHT — raise it):\n');
    for (const r of fp) process.stdout.write(`    ${r.case.id}  "${r.case.question}"  → ${r.case.expect_source}\n`);
  }
  if (fn.length) {
    process.stdout.write('\n  Under-refused (threshold too LOOSE — lower it). Fix these FIRST:\n');
    for (const r of fn) process.stdout.write(`    ${r.case.id}  "${r.case.question}"\n`);
  }

  const withDist = scored.filter((r) => typeof r.distance === 'number');
  if (withDist.length) {
    const inScope = withDist.filter((r) => !shouldRefuse(r)).map((r) => r.distance);
    const outScope = withDist.filter(shouldRefuse).map((r) => r.distance);
    const fmt = (xs) =>
      xs.length ? `min ${Math.min(...xs).toFixed(3)}  max ${Math.max(...xs).toFixed(3)}` : 'n/a';
    process.stdout.write('\n  Top-match distances (the function reported them):\n');
    process.stdout.write(`    in-scope questions      ${fmt(inScope)}\n`);
    process.stdout.write(`    should-refuse questions ${fmt(outScope)}\n`);
    if (inScope.length && outScope.length) {
      const worstIn = Math.max(...inScope);
      const bestOut = Math.min(...outScope);
      process.stdout.write(
        worstIn < bestOut
          ? `    → the classes separate. Any threshold in (${worstIn.toFixed(3)}, ${bestOut.toFixed(3)}) is clean;\n      take the midpoint ${((worstIn + bestOut) / 2).toFixed(3)}.\n`
          : `    → the classes OVERLAP (${bestOut.toFixed(3)} ≤ ${worstIn.toFixed(3)}). No threshold separates them.\n      Improve chunking or retrieval rather than picking a number.\n`
      );
    }
  } else {
    process.stdout.write('\n  The function did not report match distances. Have it return the top\n');
    process.stdout.write('  distance (a debug field is enough) — without it the threshold can only\n');
    process.stdout.write('  be tuned by bisection, redeploying between every run.\n');
  }
}

function printByKind(results) {
  const kinds = [...new Set(results.map((r) => r.case.kind))];
  process.stdout.write('\nBy kind:\n');
  for (const kind of kinds) {
    const rows = results.filter((r) => r.case.kind === kind);
    const ok = rows.filter((r) => r.pass).length;
    process.stdout.write(`  ${pad(kind, 14)} ${ok}/${rows.length} passed\n`);
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  process.stdout.write(`Ask the Playbook evals — ${CASES.length} cases against ${URL_}\n`);
  process.stdout.write(`Share ids: ${SHARE_IDS.length} (limit ${RATE_LIMIT_PER_HOUR}/hour each)\n`);
  if (!Object.keys(GUIDE_MAP).length) {
    process.stdout.write('No EVAL_GUIDE_MAP: matching sources by guide name as well as id.\n');
  }

  const results = [];
  for (const testCase of CASES) {
    process.stdout.write(`  ${testCase.id} … `);
    let outcome;
    try {
      outcome = await ask(testCase.question);
    } catch (err) {
      outcome = { httpError: err.message };
    }

    if (outcome.httpError) {
      results.push({ case: testCase, error: outcome.httpError, pass: false, failures: [], invented: [] });
      process.stdout.write('ERROR\n');
    } else {
      const verdict = evaluate(testCase, outcome.body);
      results.push({ case: testCase, ...verdict, distance: distanceOf(outcome.body) });
      process.stdout.write(`${verdict.pass ? 'ok' : 'FAIL'}\n`);
    }

    if (askedOnCurrentShare >= RATE_LIMIT_PER_HOUR && shareCursor < SHARE_IDS.length - 1) {
      shareCursor += 1;
      askedOnCurrentShare = 0;
    }
    await sleep(DELAY_MS);
  }

  printSummary(results);
  printByKind(results);
  printInvented(results);
  printRefusalBoundary(results);

  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} cases passed\n`);
  if (failed.length) {
    process.stdout.write(`FAILED: ${failed.map((r) => r.case.id).join(', ')}\n`);
    process.exit(1);
  }
  process.stdout.write('All cases passed. Record the threshold this was run at.\n');
}

main().catch((err) => die(`Runner crashed: ${err && err.stack ? err.stack : err}`));
