# Audit log

Every production-readiness audit that produced a decision, oldest first.
Process and check definitions: [`PRODUCTION_AUDIT.md`](PRODUCTION_AUDIT.md).

Entries are appended by `node scripts/audit.mjs --log`. **The "Fixed" line is
written by hand** — the table records state, the Fixed line records what
changed and why. A finding that vanishes between entries with no Fixed line
explaining it is the failure this log exists to prevent.

---

## 2026-08-20 — baseline — `d2af98f` on `claude/mobile-redesign` (full)

First audit. Establishes the ratchets; nothing fixed in this pass.

| Check | Value |
|---|---|
| `coverage.statements` | 6.82% |
| `definer.unpinned` | 7 fns |
| `npm.highOrCritical` | 10 vulns |
| `bundle.largestChunkKB` | 580 KB |
| `rls.tablesWithoutRls` | 0 of 31 tables |
| `edge.fnsWithoutAuth` | 0 of 15 fns |
| `secrets.hardcoded` | 0 hits |
| `a11y.imgsWithoutAlt` | 0 imgs |
| `a11y.clickableNonButtons` | 14 els |

**Overall rating: 6/10.** Strong data-layer security, serious verification gap.

**Found:**
- [HIGH] 7 `SECURITY DEFINER` functions with no `SET search_path`, all in
  `schema.sql`, none superseded by a later migration:
  `get_pack_guide_counts`, `handle_new_subscription_usage`, `handle_new_user`,
  `handle_new_user_subscription`, `increment_usage`, `recalculate_usage_stats`,
  `reset_user_account`. The other 31 definer functions already pin it, so these
  are stragglers from before the convention.
- [HIGH] 10 high/critical runtime advisories.
- [HIGH] 4 Deno tests covering the money paths (`stripe-webhook` ×2,
  `change-subscription-plan`, `revenuecat-webhook`) exist but CI never runs
  them — they have never gated a merge.
- [MEDIUM] `e2e/host-property-flow.mjs` wired to nothing; has never been run.
- [MEDIUM] **Schema drift** — migrations `20240128`–`20240132` are written but
  not applied to the live database (verified by probe). This blocks the e2e and
  is why `SHARE_LABELS_ENABLED` / `ASK_PLAYBOOK_ENABLED` correctly default OFF.
- [MEDIUM] Coverage is 6.82% overall, and the shape matters more than the
  number: `services/` 42.3% and `lib/` 26.7%, but `contexts/` **0%** (680
  statements) and `hooks/` **0%** (360). Every pure function is tested; nothing
  that touches I/O is. `DataContext` (547 LOC), `SupabaseAuthContext` (419 LOC)
  and `useSubscription` (157 LOC, gates money) are all at zero.
- [MEDIUM] `SIMILARITY_THRESHOLD = 0.35` in `_shared/askPlaybook.ts` is
  self-documented as an uncalibrated guess that must be set from the eval set
  before Ask-the-Playbook ships. `evals/ask-playbook/` exists, unwired.
- [LOW] CI builds with `VITE_ENABLE_AI_GENERATION: 'false'`, so no AI surface
  is ever smoke-built.
- [LOW] `revenuecat-webhook` compared its shared secret with `!==`.
- [LOW] `main.jsx:20` registers `/sw.js` whenever `PROD`, which fails under
  Capacitor on both native platforms.

**Corrected during this run:** an initial line-based grep reported "5 images
without alt, 3 clickable non-buttons". Both were wrong — a line-based grep
cannot see multi-line JSX attributes. Verified independently: **0** of 11
images lack alt, and there are **14** clickable non-buttons. The ratchets use
the verified numbers.

**Fixed:** nothing — baseline only.

---

## 2026-08-20 — phase 1 — `claude/mobile-redesign` (full)

Security and supply chain, per the agreed Phase 1.

| Check | Value | Δ |
|---|---|---|
| `coverage.statements` | 6.82% | — |
| `definer.unpinned` | **0 fns** | ▼ 7 |
| `npm.highOrCritical` | **5 vulns** | ▼ 5 |
| `bundle.largestChunkKB` | 580 KB | — |
| `rls.tablesWithoutRls` | 0 of 31 | — |
| `edge.fnsWithoutAuth` | 0 of 15 | — |
| `secrets.hardcoded` | 0 | — |
| `a11y.imgsWithoutAlt` | 0 | — |
| `a11y.clickableNonButtons` | 14 | — |

**Fixed:**
1. **All 7 unpinned `SECURITY DEFINER` functions** —
   [`20240133_definer_search_path.sql`](../../supabase/migrations/20240133_definer_search_path.sql).
   Uses `ALTER FUNCTION ... SET search_path = public` rather than
   `CREATE OR REPLACE`, so the fix cannot silently change a function body or
   drift from `schema.sql`. Idempotent, and skips functions absent from a given
   environment rather than aborting the migration.
2. **`ws` 8.19.0 → 8.21.3, `nanoid` → 3.3.18, `@remix-run/router` → 1.23.4,
   `yaml` → ^2.9.0** via `overrides` in `package.json`. Overrides specifically
   so `@supabase/supabase-js` stays on its exact pin — floating it to satisfy
   an advisory would have been the larger risk.
3. **Constant-time shared-secret comparison** in `revenuecat-webhook`. The old
   `!==` short-circuits at the first differing byte, leaking the secret's
   prefix to anyone who can time responses. Both sides are now SHA-256'd (which
   also fixes the length, removing the length leak) and compared with
   `timingSafeEqual`.

**Deliberately NOT fixed, carried forward:**
- **`react-router` 6.30.2** — the advisory range covers *all* of v6, so the only
  fix is a v7 major. Out of Phase 1 scope; needs its own migration pass.
  Overriding `@remix-run/router` to 1.23.4 removed that half of the chain.
- **4 build-time advisories** via `sucrase` (`brace-expansion`, `glob`,
  `minimatch`, `picomatch`). Not shipped to users. Overriding deep build-tool
  deps risks breaking the Tailwind build for no user-facing gain.
- **`uuid` 10.0.0** — flagged high, **not exploitable here**. The advisory is a
  missing bounds check in v3/v5/v6 *when `buf` is provided*; this app calls
  `v4()` and never passes `buf`. `npm audit fix --force` wanted a breaking
  major for zero security benefit, so the count was left honest instead.
- **`ws`** was patched anyway, but for the record it never reached users:
  it is absent from the built browser bundle, because `realtime-js` uses the
  platform `WebSocket` in browsers and only requires `ws` under Node.

The `npm.highOrCritical` ratchet is therefore set to **5**, with the reason
recorded inline in `scripts/audit.mjs`. It is there to catch a sixth, not to
bless these five.

**Verified after the changes:** lint clean, 180/180 tests pass, production
build succeeds. The `revenuecat-webhook` change could **not** be type-checked
or unit-tested locally — Deno is not installed on this machine, and CI does not
run the Deno tests either (see `orphan.denoTests`). It was reviewed by hand and
brace-balanced only. **That is exactly the gap Phase 2 closes, and this change
is a live example of why it matters.**

---

## 2026-08-20 — phase 2 — `claude/mobile-redesign` (full)

Making CI tell the truth. No production code changed in this pass; the point
was to make existing tests actually execute.

| Check | Value | Δ |
|---|---|---|
| `coverage.statements` | 6.82% | — |
| `definer.unpinned` | 0 fns | — |
| `npm.highOrCritical` | 5 vulns | — |
| `bundle.largestChunkKB` | 580 KB | — |
| `rls.tablesWithoutRls` | 0 of 31 | — |
| `edge.fnsWithoutAuth` | 0 of 15 | — |
| `ci.denoTestsWired` | **1** | ▲ from 0 |
| `ci.aiSmokeBuild` | **1** | ▲ from 0 |

**Fixed:**
1. **The money-path tests now run.** Added a `Set up Deno` step and
   `npm run test:functions` to [`ci.yml`](../../.github/workflows/ci.yml).
   **First-ever execution: 26 passed, 0 failed** across `stripe-webhook`
   (idempotency, ordering, Billing-Portal reconciliation),
   `change-subscription-plan`, and `revenuecat-webhook` mapping. They had
   existed unrun since they were written.
2. **CI builds the AI surfaces.** The artifact build sets
   `VITE_ENABLE_AI_GENERATION: 'false'`, so nothing behind an AI flag was ever
   compiled. Added a discard-output smoke build with `AI_GENERATION`,
   `FAMILY_SHARING`, `ASK_PLAYBOOK` and `HOST_PRODUCT` all on. Verified locally
   before wiring it up — it builds clean, so this does not hand CI a red run.
3. **The ratchet runs in CI** as its own `audit` job.
4. **Both new wirings are themselves ratcheted** (`ci.denoTestsWired`,
   `ci.aiSmokeBuild`), so deleting either step now fails the audit. Both were
   mutation-tested: removing the Deno step and flipping the AI flag to `false`
   each correctly flip their check to 0 and regress.

**Resolved from the phase 1 entry:** the `revenuecat-webhook` constant-time
change could not be type-checked in phase 1 because Deno was not installed.
Deno 2.9.5 is now installed locally and `deno check` on that file reports **no
error from the new code**. The single `TS18046: 'err' is of type 'unknown'` it
does report is pre-existing — the same `catch (err) { err.message }` line
already present in `HEAD` (line 111 there, 131 after the +20-line change), and
already documented in the `stripe-webhook` test header as the reason for
`--no-check`.

**Found while wiring it up:**
- Deno 2 will not resolve `npm:` specifiers against the repo's `node_modules`;
  `--node-modules-dir=none` is required. Encoded in the npm script so nobody
  rediscovers it.
- The audit's Deno detection initially missed the new CI step, because it
  grepped `ci.yml` for a literal `deno test` while CI calls
  `npm run test:functions`. The check now resolves that indirection — an npm
  script counts only if it genuinely shells out to `deno test`.

**Carried forward, unchanged:** the 5 npm advisories (§4.5), the e2e blocked on
schema drift (§6), and coverage at 6.82% — phase 3 is the coverage work.

**Verified:** lint clean, 180/180 vitest, 26/26 deno, artifact build succeeds,
AI-flags build succeeds, `npm run audit` PASS.

**Found, and NOT fixed — the new machinery immediately caught one of my own
changes:** the 26 Deno tests cover `mapping.ts` (pure logic), not `index.ts`.
`revenuecat-webhook`'s auth gate — including the constant-time `secretsMatch`
added in phase 1 — is therefore **type-checked but never executed**. Confirmed
two ways: `@std/crypto` does not appear in `deno.lock` (nothing under test ever
imports it), and `deno eval` was needed to verify `timingSafeEqual` behaves
(it does: `true` for equal input, `false` for differing).

This is not a quick add, which is why it is deferred rather than done here:
`index.ts` calls `Deno.serve()` at module load, so importing it in a test
starts a server. The codebase already solved this once — that is exactly why
`mapping.ts` exists as a separate pure module. The fix is the same move:
extract `secretsMatch` beside it and test it there. **First item for phase 3.**

**Also note:** running the Deno tests generated a root `deno.lock` pinning all
JSR/npm specifiers with integrity hashes. It should be committed — it is what
makes the CI Deno step reproducible.

---

## 2026-08-20 — phase 3 — `claude/mobile-redesign` (full)

Coverage, aimed at the paths where a bug costs money or leaks data rather than
at the percentage.

| Check | Value | Δ |
|---|---|---|
| `coverage.statements` | **17.99%** | ▲ from 6.82 |
| vitest tests | **228** | ▲ from 180 |
| deno tests | **35** | ▲ from 26 |
| `definer.unpinned` | 0 fns | — |
| `npm.highOrCritical` | 5 vulns | — |
| `ci.denoTestsWired` | 1 | — |

Per layer: `services/` 43.2%, `contexts/` **35.1%** (was 0), `lib/` 28.4%,
`hooks/` **23.1%** (was 0), `components/` 16.7%, `pages/` **8.6%** (was 2.2).

**Fixed:**
1. **`_shared/webhookAuth.ts` + 9 tests** — extracted `secretsMatch` out of
   `revenuecat-webhook/index.ts`, which was the item this log flagged at the
   end of phase 2. It is now executed, not merely type-checked. Tests cover
   the byte-by-byte prefix attack a timing leak enables, and every
   missing-secret shape. Mutation-tested: reverting to `===` fails the "both
   missing does NOT authenticate" case — the shape where an unconfigured
   deployment would accept every request.
2. **`useSubscription`, 0% → covered, 13 tests.** The two write paths that
   cost money. Notably pins that a downgrade is *scheduled*, not immediate,
   and that a `200 OK` carrying `success: false` is treated as a failure —
   without that check the UI reports a downgrade that never happened.
3. **`SupabaseAuthContext`, 0% → covered, 18 tests.** Session validation
   (`getUser()` round-trip, not just `getSession()`'s local read), the
   `session_not_found` branch that must NOT call `signOut` or it re-enters the
   403 loop, sign-out clearing local state even when the network fails, and
   the `sb-*-auth-token` purge. `isPremium` is table-tested across 8
   status/plan pairs — a paid plan with a lapsed subscription must not unlock
   features.
4. **`DataContext` cache, 0% → covered, 10 tests.** The cache is keyed on user
   id because serving a stale one on a shared device shows one family's
   private guides to another. Mutation-tested: removing the cross-user guard
   fails the test.
5. **Screen smoke tests, 4 screens, 7 tests.** `pages/` was 2.2%, so a screen
   could throw on mount and only a human clicking would notice — the same
   class of failure as the AI handoff row lost in the 3-tab redesign.

**Coverage ratchet tightened 6.8 → 17.9 in this change**, per §1: a ratchet
left behind its own improvement protects nothing.

**Found while writing the tests — three of my own mistakes, recorded because
the next person will hit them:**
- `iapActive` is a **function** (`IAP_ENABLED && isNative()`), not a boolean.
  Mocking it as `false` throws on mount. Cost the most time of anything here.
- `DataContext`'s load effect keys on **`session`**, not `user`. A fixture
  supplying only `user` takes the signed-out branch, which wipes state *and*
  deletes the cache — so cache tests silently tested nothing. That branch is
  now a test of its own.
- Screen smokes are **one file per screen**. Several large screen graphs in a
  single file hang the run. And LoginScreen must be given a **signed-out**
  fixture: hand it a user and it loops on its post-auth redirect. The screen
  is right; the fixture was wrong.

**Carried forward:** `pages/` is still 8.6% — the four smoke tests are a floor
("does it mount"), not interaction coverage. `GuideDetail`, `CreateGuideScreen`,
`BundleDetail` and `ManageFamilyScreen` remain at 0% and are the next targets.
The 5 npm advisories and the e2e schema drift are unchanged.

**Verified:** lint clean, 228/228 vitest, 35/35 deno, both builds succeed,
`npm run audit` PASS at the tightened ratchet.

---

## 2026-08-20 — phase 4 — `claude/mobile-redesign` (full)

Performance, accessibility, and closing out the orphaned suites.

| Check | Value | Δ |
|---|---|---|
| `bundle.largestChunkKB` | **186 KB** | ▼ from 580 |
| `a11y.clickableNonButtons` | **5 els** | ▼ from 14 |
| `a11y.eslintPlugin` | **1** | new — jsx-a11y now enforced |
| `coverage.statements` | 17.98% | — |
| `definer.unpinned` | 0 fns | — |
| `npm.highOrCritical` | 5 vulns | — |

**Fixed:**
1. **Entry chunk 580 KB → 186 KB** via `manualChunks`
   ([`vite.config.js`](../../vite.config.js)). Routes were already lazy-loaded
   (33), but everything they shared collapsed into one chunk every cold start
   had to download before anything rendered. Split per library —
   `react-vendor` 143 KB, `supabase` 137 KB, `motion` 102 KB, `router` 22 KB,
   `date-fns` 21 KB, `icons` 19 KB — so an app-code change does not invalidate
   React and a Supabase bump does not invalidate the icons. The Rollup
   chunk-size warning is gone. Verified in a real browser against
   `vite preview`: every split chunk 200 OK, zero console errors.
2. **`eslint-plugin-jsx-a11y` enabled**, and the 41 violations it found
   triaged: 33 fixed, 8 switched off with the reason recorded inline.
   - 10 clickable `div`s now spread `keyboardClickable(onClick)`, a new helper
     in `lib/utils.js` giving them the role, tab stop and Enter/Space handling
     a real button has, with no styling change. One more — GuideDetail's step
     row — is conditionally interactive, so its tab stop and key handler are
     conditional too; a read-only step must not advertise itself as
     actionable.
   - 12 labels wired to their controls with `htmlFor`/`id`.
   - Off with reasons: `media-has-caption` (guide videos are family-uploaded;
     there is no caption track, and an empty `<track>` would satisfy the
     linter while helping nobody), `no-autofocus` (two deliberate uses), and
     `heading-has-content` scoped to `components/ui/**` only (shadcn
     `AlertTitle`/`CardTitle` receive content via `{...props}`, which the rule
     cannot see).
   - `a11y.eslintPlugin` is now ratcheted, so removing the plugin fails the
     audit. Mutation-tested.
3. **ServiceWorker no longer errors on native.** `main.jsx` registered
   `/sw.js` whenever `PROD`, which Capacitor's WebViewLocalServer cannot serve
   — an error on every cold start of both native apps, buying nothing (a
   packaged app has no offline problem to solve). Now skipped when
   `isNative()`. The web PWA path is untouched and still registers.
4. **`e2e/` and `evals/` are wired, not deleted.** `npm run e2e` and
   `npm run eval:ask-playbook` exist, and
   [`e2e.yml`](../../.github/workflows/e2e.yml) runs them on **manual dispatch
   only**. Never on push, deliberately: the e2e writes and deletes real rows
   as a live test user and the eval spends OpenAI credit. Both were worth
   keeping — they are careful, dependency-free scripts — they simply cannot
   pass until the schema drift is resolved.

**Ratchets tightened in this change:** bundle 600 → 200 KB,
clickableNonButtons 14 → 5, plus the new `a11y.eslintPlugin` floor.

**Found:** `--quiet` in the lint script hides warnings, so
`react-hooks/exhaustive-deps` (4) and `import/no-duplicates` (2, one of them a
genuine duplicate `react-router-dom` import in `CreateFab.jsx` since `a312d04`)
have been invisible the whole time. Not touched here — turning them into
errors is its own decision — but worth knowing that "lint clean" currently
means "no errors", not "no findings".

**Carried forward:** the 5 npm advisories (react-router needs a v7 major; four
are build-time only), the schema drift blocking e2e, `pages/` coverage at 8.6%
with `GuideDetail`, `CreateGuideScreen`, `BundleDetail` and
`ManageFamilyScreen` still at 0%.

**Verified:** lint clean with jsx-a11y on, 228/228 vitest, 35/35 deno, build
succeeds, production build verified in-browser, `npm run audit` PASS at all
tightened ratchets.
