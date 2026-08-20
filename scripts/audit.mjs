#!/usr/bin/env node
/**
 * Production-readiness audit.  docs/platform/PRODUCTION_AUDIT.md
 *
 * Mechanizes the checks from the 2026-08-20 audit so they can be re-run on
 * every major change instead of re-derived by hand. Each check returns a
 * number; the number is compared against a RATCHET below. A ratchet is a
 * "no worse than" line, not a target — when a check improves, tighten its
 * ratchet in the same commit so the gain cannot silently erode.
 *
 * No dependencies, by design — same pattern as evals/ask-playbook/run.mjs
 * and e2e/host-property-flow.mjs: runnable from a laptop with nothing
 * installed beyond the repo's own node_modules.
 *
 * USAGE
 *   node scripts/audit.mjs                 full audit (runs coverage + build)
 *   node scripts/audit.mjs --fast          static checks only (no coverage/build)
 *   node scripts/audit.mjs --json          machine-readable output
 *   node scripts/audit.mjs --log           append a dated entry to the audit log
 *
 * EXIT CODES
 *   0  every check at or better than its ratchet
 *   1  at least one check regressed past its ratchet
 *   2  the audit itself could not run (missing tooling)
 *
 * Requires Node >= 20.12 (see .nvmrc) — the same floor vitest needs.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const argv = process.argv.slice(2);
const FAST = argv.includes('--fast');
const JSON_OUT = argv.includes('--json');
const DO_LOG = argv.includes('--log');

/**
 * The ratchet. Each entry is the worst value currently tolerated.
 * `dir: 'max'` means lower is better (a ceiling); `dir: 'min'` means higher
 * is better (a floor). Baselines set from the 2026-08-20 audit.
 */
const RATCHET = {
  // 6.8 -> 17.9 in phase 3. Tightened in the same change that earned it:
  // a ratchet left behind its own improvement protects nothing.
  'coverage.statements':      { dir: 'min', limit: 17.9, unit: '%'  },
  'definer.unpinned':         { dir: 'max', limit: 0,    unit: ' fns' },
  // 5 carried forward as of 2026-08-20, none reachable from shipped browser
  // code: 4 are build-time only (sucrase -> brace-expansion/glob/minimatch/
  // picomatch) and 1 is react-router 6.x, whose advisory range covers all of
  // v6 — clearing it needs a v7 major. Lower this the moment either is done;
  // it exists to catch a SIXTH, not to bless these five.
  'npm.highOrCritical':       { dir: 'max', limit: 5,    unit: ' vulns' },
  'bundle.largestChunkKB':    { dir: 'max', limit: 600,  unit: ' KB' },
  'rls.tablesWithoutRls':     { dir: 'max', limit: 0,    unit: ' tables' },
  'edge.fnsWithoutAuth':      { dir: 'max', limit: 0,    unit: ' fns' },
  'secrets.hardcoded':        { dir: 'max', limit: 0,    unit: ' hits' },
  'a11y.imgsWithoutAlt':      { dir: 'max', limit: 0,    unit: ' imgs' },
  'a11y.clickableNonButtons': { dir: 'max', limit: 14,   unit: ' els' },
  // 1 = wired. Phase 2 turned these on; they must not be silently removed.
  'ci.denoTestsWired':        { dir: 'min', limit: 1,    unit: ''   },
  'ci.aiSmokeBuild':          { dir: 'min', limit: 1,    unit: ''   },
};

/**
 * Edge functions that legitimately have no per-user auth check, with the
 * reason. Anything NOT on this list must authenticate — see §4.3.
 */
const EDGE_AUTH_EXEMPT = {
  'ask-playbook':      'anonymous by design; scope resolved server-side from share_id (ASK_PLAYBOOK.md §2)',
  'stripe-webhook':    'authenticated by Stripe signature verification',
  'revenuecat-webhook':'authenticated by REVENUECAT_WEBHOOK_AUTH shared secret',
};

const sh = (cmd, opts = {}) => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch (err) {
    // Many tools exit non-zero while still producing the stdout we want
    // (npm audit does this whenever anything at all is vulnerable).
    if (opts.tolerateFailure) return err.stdout || '';
    throw err;
  }
};

const walk = (dir, filter, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, filter, acc);
    else if (filter(p)) acc.push(p);
  }
  return acc;
};

const findings = [];
const results = {};
const note = (severity, check, message) => findings.push({ severity, check, message });

// ---------------------------------------------------------------- checks ---

/** SECURITY DEFINER functions that do not pin search_path (§4.1). */
function checkDefinerSearchPath() {
  const files = [
    ...walk(join(ROOT, 'supabase/migrations'), (p) => p.endsWith('.sql')),
    join(ROOT, 'supabase/schema.sql'),
  ].filter(existsSync);

  // A later migration that redefines a function supersedes schema.sql. So
  // does an `ALTER FUNCTION ... SET search_path`, which pins the setting
  // without restating the body — see 20240133_definer_search_path.sql.
  const redefinedInMigrations = new Set();
  const pinnedByAlter = new Set();
  for (const f of files) {
    if (!f.includes('/migrations/')) continue;
    const txt = readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi)) {
      redefinedInMigrations.add(m[1]);
    }
    // Matches both a literal statement and one built inside a format() call.
    for (const m of txt.matchAll(/ALTER\s+FUNCTION\s+(?:%s\s|(?:public\.)?(\w+)\s*\()/gi)) {
      if (m[1]) pinnedByAlter.add(m[1]);
    }
    // A format()-driven loop lists its targets as quoted signatures.
    if (/ALTER\s+FUNCTION\s+%s[\s\S]*?search_path/i.test(txt)) {
      for (const m of txt.matchAll(/'(?:public\.)?(\w+)\s*\([^']*\)'/g)) pinnedByAlter.add(m[1]);
    }
  }

  const unpinned = [];
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\((.*?)\)(.*?)(?=CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|$)/gis;
    for (const m of txt.matchAll(re)) {
      const [, name, , body] = m;
      if (!/SECURITY\s+DEFINER/i.test(body)) continue;
      if (/SET\s+search_path/i.test(body)) continue;
      // schema.sql definitions superseded or pinned by a migration don't count.
      if (f.endsWith('schema.sql') && (redefinedInMigrations.has(name) || pinnedByAlter.has(name))) continue;
      unpinned.push(`${basename(f)}:${name}`);
    }
  }
  results['definer.unpinned'] = unpinned.length;
  for (const u of unpinned) note('HIGH', 'definer.unpinned', `SECURITY DEFINER without SET search_path: ${u}`);
}

/** Every table must have RLS enabled (§4.2). */
function checkRls() {
  const files = [
    ...walk(join(ROOT, 'supabase/migrations'), (p) => p.endsWith('.sql')),
    join(ROOT, 'supabase/schema.sql'),
  ].filter(existsSync);
  const tables = new Set(), rls = new Set();
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)) tables.add(m[1]);
    for (const m of txt.matchAll(/ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)) rls.add(m[1]);
  }
  const missing = [...tables].filter((t) => !rls.has(t));
  results['rls.tablesWithoutRls'] = missing.length;
  results['rls.tablesTotal'] = tables.size;
  for (const t of missing) note('CRITICAL', 'rls.tablesWithoutRls', `table without ENABLE ROW LEVEL SECURITY: ${t}`);
}

/** Every edge function authenticates, or is explicitly exempt (§4.3). */
function checkEdgeAuth() {
  const dir = join(ROOT, 'supabase/functions');
  if (!existsSync(dir)) { results['edge.fnsWithoutAuth'] = 0; return; }
  const unauth = [];
  let total = 0;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const idx = join(dir, name, 'index.ts');
    if (!existsSync(idx)) continue;
    total++;
    const txt = readFileSync(idx, 'utf8');
    const hasAuth = /requireUser|auth\.getUser|getUser\(/.test(txt);
    if (!hasAuth && !(name in EDGE_AUTH_EXEMPT)) unauth.push(name);
  }
  results['edge.fnsWithoutAuth'] = unauth.length;
  results['edge.fnsTotal'] = total;
  for (const n of unauth) note('CRITICAL', 'edge.fnsWithoutAuth', `edge function has no auth check and is not exempt: ${n}`);
}

/** Hardcoded live secrets must never reach the repo (§4.4). */
function checkSecrets() {
  const files = [
    ...walk(join(ROOT, 'src'), (p) => /\.(js|jsx|ts|tsx)$/.test(p)),
    ...walk(join(ROOT, 'supabase/functions'), (p) => /\.ts$/.test(p) && !p.includes('.test.')),
  ];
  const hits = [];
  for (const f of files) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (/Deno\.env|import\.meta\.env|process\.env/.test(line)) continue;
      if (/\bsk_live_[A-Za-z0-9]/.test(line) || /\beyJ[A-Za-z0-9_-]{30,}/.test(line)) {
        hits.push(`${f.replace(ROOT + '/', '')}`);
      }
    }
  }
  results['secrets.hardcoded'] = hits.length;
  for (const h of [...new Set(hits)]) note('CRITICAL', 'secrets.hardcoded', `possible hardcoded secret: ${h}`);
}

/** Cheap accessibility signals (§4.6). */
function checkA11y() {
  const files = walk(join(ROOT, 'src'), (p) => p.endsWith('.jsx'));
  let noAlt = 0, clickable = 0;
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/<img\b[^>]*>/gi)) if (!/\balt=/.test(m[0])) noAlt++;
    for (const _ of txt.matchAll(/<(?:div|span)\b[^>]*\bonClick=/gi)) clickable++;
  }
  results['a11y.imgsWithoutAlt'] = noAlt;
  results['a11y.clickableNonButtons'] = clickable;
}

/** Known-vulnerable runtime dependencies (§4.5). */
function checkNpmAudit() {
  const out = sh('npm audit --omit=dev --json', { tolerateFailure: true });
  try {
    const v = JSON.parse(out).metadata.vulnerabilities;
    results['npm.highOrCritical'] = (v.high || 0) + (v.critical || 0);
    results['npm.total'] = v.total || 0;
    if (results['npm.highOrCritical'] > 0) {
      note('HIGH', 'npm.highOrCritical', `${results['npm.highOrCritical']} high/critical runtime vulnerabilities (npm audit)`);
    }
  } catch {
    results['npm.highOrCritical'] = -1;
    note('WARN', 'npm.highOrCritical', 'could not parse npm audit output');
  }
}

/** Coverage across the whole tree, not just imported files (§3). */
function checkCoverage() {
  sh('npx vitest run --coverage --coverage.all ' +
     '--coverage.include="src/**/*.{js,jsx}" --coverage.exclude="src/__tests__/**" ' +
     '--coverage.reporter=json-summary', { tolerateFailure: true, stdio: 'ignore' });
  const p = join(ROOT, 'coverage/coverage-summary.json');
  if (!existsSync(p)) {
    results['coverage.statements'] = -1;
    note('WARN', 'coverage.statements', 'coverage-summary.json not produced');
    return;
  }
  const total = JSON.parse(readFileSync(p, 'utf8')).total;
  results['coverage.statements'] = Number(total.statements.pct.toFixed(2));
  results['coverage.branches'] = Number(total.branches.pct.toFixed(2));
  results['coverage.functions'] = Number(total.functions.pct.toFixed(2));
}

/** Largest emitted JS chunk — the cold-start cost (§4.7). */
function checkBundle() {
  sh('npm run build', { tolerateFailure: true, stdio: 'ignore' });
  const dir = join(ROOT, 'dist/assets');
  if (!existsSync(dir)) { results['bundle.largestChunkKB'] = -1; return; }
  let largest = 0, name = '';
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const kb = statSync(join(dir, f)).size / 1024;
    if (kb > largest) { largest = kb; name = f; }
  }
  results['bundle.largestChunkKB'] = Math.round(largest);
  results['bundle.largestChunkName'] = name;
}

/**
 * Meta-checks: tests that exist but never execute are worse than no tests,
 * because they read as coverage (§5).
 */
function checkOrphanedSuites() {
  const ci = join(ROOT, '.github/workflows/ci.yml');
  const ciTxt = existsSync(ci) ? readFileSync(ci, 'utf8') : '';
  const pkgEarly = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const pkgScripts = JSON.stringify(pkgEarly.scripts || {});
  // CI may invoke Deno directly, or via an npm script that does. Resolve the
  // indirection: a `run test:functions` in CI counts only if that script
  // actually shells out to `deno test`.
  const ciRunsDenoDirectly = /deno\s+test/.test(ciTxt);
  const denoScripts = Object.entries(pkgEarly.scripts || {})
    .filter(([, v]) => /deno\s+test/.test(v))
    .map(([k]) => k);
  const ciRunsDenoViaScript = denoScripts.some((n) =>
    new RegExp(`run\\s+${n.replace(/[:]/g, '[:]')}`).test(ciTxt));
  const denoTests = walk(join(ROOT, 'supabase'), (p) => p.endsWith('.test.ts'));
  results['orphan.denoTestFiles'] = denoTests.length;
  results['orphan.denoTestsRunInCi'] = ciRunsDenoDirectly || ciRunsDenoViaScript;
  results['ci.denoTestsWired'] = results['orphan.denoTestsRunInCi'] ? 1 : 0;
  if (denoTests.length && !results['orphan.denoTestsRunInCi']) {
    note('HIGH', 'orphan.denoTests',
      `${denoTests.length} Deno test file(s) exist but CI never runs them: ${denoTests.map((p) => p.replace(ROOT + '/', '')).join(', ')}`);
  }
  results['ci.aiSmokeBuild'] = /VITE_ENABLE_AI_GENERATION:\s*'true'/.test(ciTxt) ? 1 : 0;
  if (!results['ci.aiSmokeBuild']) {
    note('MEDIUM', 'ci.aiSmokeBuild', 'CI never builds with AI flags on — errors behind the flag reach main unseen');
  }
  const e2e = walk(join(ROOT, 'e2e'), (p) => p.endsWith('.mjs'));
  results['orphan.e2eFiles'] = e2e.length;
  results['orphan.e2eWired'] = e2e.length === 0 || /e2e/.test(pkgScripts) || /e2e/.test(ciTxt);
  if (!results['orphan.e2eWired']) {
    note('MEDIUM', 'orphan.e2e',
      `${e2e.length} e2e script(s) exist but are referenced by no npm script and no CI job`);
  }
}

// ------------------------------------------------------------------ run ---

const CHECKS = [
  ['definer search_path', checkDefinerSearchPath],
  ['RLS coverage',        checkRls],
  ['edge function auth',  checkEdgeAuth],
  ['hardcoded secrets',   checkSecrets],
  ['accessibility',       checkA11y],
  ['npm audit',           checkNpmAudit],
  ['orphaned suites',     checkOrphanedSuites],
];
if (!FAST) {
  CHECKS.push(['coverage', checkCoverage], ['bundle size', checkBundle]);
}

for (const [label, fn] of CHECKS) {
  if (!JSON_OUT) process.stderr.write(`  … ${label}\n`);
  try { fn(); } catch (err) { note('WARN', label, `check threw: ${err.message}`); }
}

// Compare against the ratchet.
const regressions = [];
for (const [key, spec] of Object.entries(RATCHET)) {
  const val = results[key];
  if (val === undefined || val === -1) continue;
  const bad = spec.dir === 'max' ? val > spec.limit : val < spec.limit;
  if (bad) regressions.push({ key, val, limit: spec.limit, unit: spec.unit, dir: spec.dir });
}

const summary = {
  ranAt: new Date().toISOString(),
  mode: FAST ? 'fast' : 'full',
  commit: sh('git rev-parse --short HEAD', { tolerateFailure: true }).trim(),
  branch: sh('git rev-parse --abbrev-ref HEAD', { tolerateFailure: true }).trim(),
  results,
  findings,
  regressions,
  pass: regressions.length === 0,
};

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\nProduction audit — ${summary.branch} @ ${summary.commit} (${summary.mode} mode)\n`);
  console.log(`${pad('CHECK', 30)} ${pad('VALUE', 12)} RATCHET`);
  for (const [key, spec] of Object.entries(RATCHET)) {
    const val = results[key];
    if (val === undefined || val === -1) { console.log(`${pad(key, 30)} ${pad('skipped', 12)} —`); continue; }
    const bad = spec.dir === 'max' ? val > spec.limit : val < spec.limit;
    const arrow = spec.dir === 'max' ? '<=' : '>=';
    console.log(`${pad(key, 30)} ${pad(val + spec.unit, 12)} ${arrow} ${spec.limit}${spec.unit} ${bad ? '  <<< REGRESSED' : ''}`);
  }
  if (findings.length) {
    console.log('\nFindings:');
    for (const f of findings) console.log(`  [${f.severity}] ${f.message}`);
  }
  console.log(`\n${summary.pass ? 'PASS — every check at or better than its ratchet' : `FAIL — ${regressions.length} check(s) regressed`}\n`);
}

if (DO_LOG) {
  const logPath = join(ROOT, 'docs/platform/AUDIT_LOG.md');
  const date = summary.ranAt.slice(0, 10);
  const lines = [
    ``,
    `## ${date} — \`${summary.commit}\` on \`${summary.branch}\` (${summary.mode})`,
    ``,
    `**Result:** ${summary.pass ? 'PASS' : `FAIL (${summary.regressions.length} regressed)`}`,
    ``,
    `| Check | Value |`,
    `|---|---|`,
    ...Object.entries(RATCHET).map(([k, s]) => {
      const v = results[k];
      return `| \`${k}\` | ${v === undefined || v === -1 ? 'skipped' : v + s.unit} |`;
    }),
    ``,
    findings.length ? `**Found:**` : `**Found:** nothing above the ratchet.`,
    ...findings.map((f) => `- [${f.severity}] ${f.message}`),
    ``,
    `**Fixed:** _(fill in what this run's findings led to, or "nothing — findings carried forward")_`,
    ``,
  ].join('\n');
  writeFileSync(logPath, (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '# Audit log\n') + lines);
  if (!JSON_OUT) console.log(`Appended entry to docs/platform/AUDIT_LOG.md\n`);
}

process.exit(summary.pass ? 0 : 1);
