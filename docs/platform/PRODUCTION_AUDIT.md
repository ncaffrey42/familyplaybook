# Production Audit: The Standing Check

**Status:** Live process, mechanized in [`scripts/audit.mjs`](../../scripts/audit.mjs).
Baseline established 2026-08-20; every run since is recorded in
[`AUDIT_LOG.md`](AUDIT_LOG.md).

Run this before merging anything structural — a new table, a new edge
function, a dependency bump, a release cut. It is deliberately cheap enough
to run more often than that.

---

## 1. Why a ratchet, not a target

Every check produces a number compared against a **ratchet**: the worst value
currently tolerated. A ratchet is *not* a goal. It records where the codebase
actually stands so it cannot quietly get worse.

The rule that makes it work: **when a check improves, tighten its ratchet in
the same commit.** Coverage that climbs to 12% and leaves its ratchet at 6.8%
has bought nothing — the next change is free to undo it. Tightening is how a
one-off improvement becomes permanent.

Ratchets live at the top of [`scripts/audit.mjs`](../../scripts/audit.mjs) in
the `RATCHET` object, so the numbers and the code that enforces them can never
drift apart.

## 2. Running it

```bash
npm run audit                    # full — includes coverage + a production build (~90s)
npm run audit:fast               # static checks only (~15s)
npm run test:functions           # the Deno edge-function tests (needs deno installed)

node scripts/audit.mjs           # full — includes coverage + a production build (~90s)
node scripts/audit.mjs --fast    # static checks only (~15s), no coverage or build
node scripts/audit.mjs --json    # machine-readable, for CI
node scripts/audit.mjs --log     # append a dated entry to AUDIT_LOG.md
```

Exit codes: `0` everything at or better than its ratchet, `1` something
regressed, `2` the audit could not run. Needs Node >= 20.12 — the same floor
vitest has, pinned in [`.nvmrc`](../../.nvmrc). Run `nvm use` first.

Use `--fast` while iterating; run the full audit before you log a result,
because coverage and bundle size are the two checks most likely to move and
they are exactly the two `--fast` skips.

## 3. What the checks mean

| Check | Ratchet | What a regression means |
|---|---|---|
| `coverage.statements` | >= 6.8% | Code was added without tests, faster than tests were added |
| `definer.unpinned` | 0 | A `SECURITY DEFINER` function shipped without `SET search_path` (§4.1) |
| `npm.highOrCritical` | 0 | A high/critical advisory landed in a **runtime** dependency |
| `bundle.largestChunkKB` | <= 200 KB | The entry chunk grew; cold start on mobile got worse |
| `rls.tablesWithoutRls` | 0 | A table shipped without RLS — treat as an outage-grade bug |
| `edge.fnsWithoutAuth` | 0 | An edge function has no auth check and no documented exemption |
| `secrets.hardcoded` | 0 | A live key pattern reached the repo |
| `a11y.imgsWithoutAlt` | 0 | An image shipped without alt text |
| `a11y.clickableNonButtons` | <= 5 | A new `onClick` on a `div`/`span` — not keyboard reachable |
| `a11y.eslintPlugin` | >= 1 | `eslint-plugin-jsx-a11y` was removed — every a11y rule silently stops |
| `ci.denoTestsWired` | >= 1 | The CI step that runs the money-path Deno tests was removed |
| `ci.aiSmokeBuild` | >= 1 | The CI build with AI flags on was removed |

### 4.1 `definer.unpinned`

A `SECURITY DEFINER` function runs with its **owner's** privileges. Without a
pinned `search_path`, the *caller* controls schema resolution and can shadow
an unqualified name the body depends on, executing their own object as the
definer. This is the standard Postgres privilege-escalation shape.

Fix by adding `SET search_path = public` to the definition, or — for functions
already deployed — `ALTER FUNCTION ... SET search_path = public`, which pins
the setting without restating the body. See
[`20240133_definer_search_path.sql`](../../supabase/migrations/20240133_definer_search_path.sql).

The check understands both forms, and treats a `schema.sql` definition as
resolved if a later migration redefines *or* pins it.

### 4.2 `rls.tablesWithoutRls`

Compares every `CREATE TABLE` against every `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY` across `schema.sql` and all migrations. This project has held 31/31
since the baseline. Because RLS is the only thing standing between one
family's data and another's, treat any regression here as release-blocking.

### 4.3 `edge.fnsWithoutAuth`

Every function under `supabase/functions/` must call `requireUser()` or
`auth.getUser()`, **or** appear in the `EDGE_AUTH_EXEMPT` map in the script
with a written reason. Three are exempt today, each legitimately:

| Function | Why it has no per-user auth |
|---|---|
| `ask-playbook` | Anonymous by design — guests are unauthenticated. Scope is resolved server-side from the share id alone via `resolve_ask_scope`; the caller never supplies a guide list ([`ASK_PLAYBOOK.md`](ASK_PLAYBOOK.md) §2) |
| `stripe-webhook` | Authenticated by Stripe signature verification |
| `revenuecat-webhook` | Authenticated by the `REVENUECAT_WEBHOOK_AUTH` shared secret, compared in constant time |

Adding to that map is a deliberate act. If you cannot write the reason, the
function needs auth instead.

### 4.4 `secrets.hardcoded`

Greps `src/` and `supabase/functions/` for `sk_live_*` and JWT-shaped literals,
ignoring anything read from `Deno.env` / `import.meta.env` / `process.env`, and
skipping `.test.ts` files (which legitimately contain `sk_test_dummy`).

### 4.5 `npm.highOrCritical`

Runs `npm audit --omit=dev`, so build-time tooling does not create noise that
trains people to ignore the check.

**Severity counts are a starting point, not a verdict.** Two examples from the
baseline run, both of which looked alarming and were not:

- `ws` (high, uninitialized memory disclosure) arrives via
  `@supabase/supabase-js` → `realtime-js`. It is **absent from the built
  browser bundle** — realtime-js uses the platform `WebSocket` in browsers and
  only reaches for `ws` under Node. Real exposure: none, for a pure SPA.
- `uuid` (high) is a bounds check missing in **v3/v5/v6 when `buf` is
  provided**. This app calls `v4()` and never passes `buf`. Not exploitable —
  and `npm audit fix --force` wanted a breaking major to "fix" it.

Prefer `overrides` in `package.json` to pin a patched transitive version over
bumping a pinned direct dependency. `@supabase/supabase-js` is pinned to an
exact version on purpose; do not float it to satisfy an advisory.

### 4.6 Accessibility

`eslint-plugin-jsx-a11y` is enabled as of phase 4 and is the real gate; the
regex counts remain only as a backstop in case the plugin is removed, which
`a11y.eslintPlugin` also guards.

Three rules are switched off, each with the reason recorded inline in
[`eslint.config.mjs`](../../eslint.config.mjs):

| Rule | Why |
|---|---|
| `media-has-caption` | Every guide video is uploaded by the family that wrote it. There is no caption track to point at, and an empty `<track>` would satisfy the linter while helping nobody. Revisit if voice-to-guide ever produces transcripts |
| `no-autofocus` | Two deliberate uses — the login email field and the AI sheet's prompt box — both opened by an explicit user action where focus is the expected outcome |
| `heading-has-content` | Scoped to `src/components/ui/**` only. `AlertTitle`/`CardTitle` receive their content through `{...props}`, which the rule cannot see. Narrow scope so a genuinely empty heading in app code is still caught |

For elements that must stay a `div`, spread
[`keyboardClickable(onClick)`](../../src/lib/utils.js) onto them: it supplies
the role, tab stop and Enter/Space handling a real button has, without
touching styling. Prefer an actual `<button>` in new code.

### 4.7 `bundle.largestChunkKB`

Route-level splitting was already good — 33 lazy routes — but everything those
routes shared collapsed into one ~580 KB entry chunk that every cold start had
to download before anything rendered.

Phase 4 added a `manualChunks` bucket per large, stable library
([`vite.config.js`](../../vite.config.js)): **entry 580 KB → 186 KB**, with
`react-vendor`, `supabase`, `motion`, `router`, `icons` and `date-fns` split
out. Bucketed by library rather than one `vendor` chunk so a change in app
code does not invalidate React, and a Supabase bump does not invalidate the
icons. Only genuinely large dependencies are split — for anything small, an
extra request costs more than it saves.

## 5. Tests that exist but never run

The audit also reports two meta-findings, because a suite that never executes
is worse than no suite — it reads as coverage in every summary while proving
nothing.

- **`orphan.denoTests`** — **closed 2026-08-20 (phase 2).** The four Deno
  tests under `supabase/functions/` cover `stripe-webhook` (×2),
  `change-subscription-plan`, and `revenuecat-webhook`: precisely the money
  paths. [`vitest.config.js`](../../vitest.config.js) correctly excludes them
  (they are Deno, not vitest), and CI previously had no `deno test` step, so
  they had never gated a merge. CI now runs them via `npm run test:functions`,
  and `ci.denoTestsWired` ratchets that step so it cannot be silently dropped.

  Two things that trip you up running them locally, both encoded in the npm
  script: Deno 2 refuses to resolve `npm:` specifiers against the repo's
  `node_modules`, so `--node-modules-dir=none` is required; and
  `_shared/stripe.ts` constructs its Stripe/Supabase clients at module load,
  so dummy env vars must be present even though the tests inject fakes.
  `--no-check` is deliberate — it sidesteps a pre-existing
  `catch (err) { err.message }` strict-mode error that predates the tests.
- **`orphan.e2e`** — see §6.

## 5.1 What CI enforces

[`ci.yml`](../../.github/workflows/ci.yml) runs two jobs:

| Job | Steps |
|---|---|
| `ci` | lint → vitest → **Deno edge-function tests** → **build with AI flags ON** → build artifact |
| `audit` | `npm run audit` — the full ratchet |

The **AI-flags build** exists because the artifact build sets
`VITE_ENABLE_AI_GENERATION: 'false'`, so before phase 2 no AI surface was ever
compiled in CI. Its output is discarded; it is there so a syntax or import
error behind a flag cannot reach main unseen.

The `audit` job **can go red without any code change**, because the npm-audit
check reads a live advisory feed. That is intended: a new high/critical
advisory in a runtime dependency is news. Triage it — §4.5 shows two baseline
advisories that turned out to be unreachable — then either fix it or raise the
ratchet with the reason recorded inline. Never delete the check.

## 6. End-to-end status

[`e2e/host-property-flow.mjs`](../../e2e/host-property-flow.mjs) (716 lines) is
a well-built script: zero dependencies, drives Supabase REST/RPC directly with
no browser, and distinguishes *not ready* (exit 2) from *broken* (exit 1). Its
own header states it has **never been run**, and as of 2026-08-20 that is still
true. It is referenced by no npm script and no CI job.

It is blocked on two prerequisites, both real:

1. **Schema drift.** Migrations `20240128`–`20240132` are written but **not
   applied** to the live database. Verified by probe on 2026-08-20:
   `user_dismissals` and `shared_links.expires_at` (20240117) exist;
   `shared_links.recipient_label` (20240128), `ask_playbook_available`
   (20240129), `properties` (20240130) and `notifications` (20240132) all
   return 400/404. The flow under test depends on 20240128–20240131.
2. **No test user.** It needs `E2E_EMAIL` / `E2E_PASSWORD` for a **disposable**
   account — never a real one.

This drift is also why `SHARE_LABELS_ENABLED` and `ASK_PLAYBOOK_ENABLED`
default OFF in [`featureFlags.js`](../../src/lib/featureFlags.js): the flags
are correctly guarding against exactly this state. Do not flip either on
before the matching migration is applied.

**Wired in phase 4, still gated.** `npm run e2e` and `npm run eval:ask-playbook`
now exist, and [`e2e.yml`](../../.github/workflows/e2e.yml) runs either on
**manual dispatch only** — never on push. That is deliberate: the e2e creates
and deletes real properties, guides and share links as a live test user, and
the eval spends OpenAI credit. Running them per-commit would write production
rows and burn money on every push.

Neither can pass yet. What remains:

1. Apply migrations `20240128`–`20240132`.
2. Create a **disposable** test user — never a real account.
3. Add `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_EMAIL`,
   `E2E_PASSWORD` as repo secrets. The workflow checks for these and fails
   with a pointer here rather than letting the script exit on a missing env
   var, which reads as "the feature is broken".

Treat the first green run as data collection — both headers are right that you
will fix the script as much as the feature. The eval's specific job is to
calibrate `SIMILARITY_THRESHOLD` from its refusal-boundary report; that must
happen before `ASK_PLAYBOOK_ENABLED` is turned on for real users
([`ASK_PLAYBOOK.md`](ASK_PLAYBOOK.md) §10).

## 7. Logging protocol

Every run that produces a decision goes in [`AUDIT_LOG.md`](AUDIT_LOG.md),
newest last. `node scripts/audit.mjs --log` appends the table and findings
automatically; **you fill in the "Fixed" line by hand.** That line is the
point of the log — the numbers show state, the Fixed line shows what state
changed and why.

If a finding is *not* fixed, say so and say why. "Carried forward — needs a
react-router v7 major, out of scope for this pass" is a useful log entry. A
finding that silently disappears between runs is the failure mode this log
exists to prevent.
