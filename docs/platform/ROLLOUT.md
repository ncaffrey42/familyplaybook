# Rollout Plan — the Synthesis

**Status:** The plan that sequences everything the Ledger designed into
shippable milestones. Deliverable of Prompt 15 — the last of the core
sequence. This document reads *all* of `docs/platform/` and turns it into
an order of operations with gates. Nothing here is new design; it is the
executable synthesis of what's already recorded.

Read [`DECISIONS.md`](DECISIONS.md) for the *why* behind any step and
[`DATA_MODEL.md`](DATA_MODEL.md) §5–6 for the standing findings the gates
reference.

---

## 0. Where things actually stand (the honest baseline)

Everything built in Prompts 0–14 is **committed on `claude/mobile-redesign`,
dark, and applied nowhere.** The rollout starts from:

| Layer | State |
|---|---|
| **Design** | Complete: tenancy, RBAC, content engine, auth, nav, sharing, Ask, host shell/properties/teams, mobile split, data model, API — all in `docs/platform/` |
| **Migrations written** | `20240128`–`20240132` (sharing, Ask, properties+taxonomy, starter library, notifications). **Unapplied.** Two fix-migrations in flight (`20240133` definer `search_path`; snapshot-marker generator fix) |
| **Migrations designed, unwritten** | Tenancy wave (`ARCHITECTURE.md` §8) and RBAC wave (`RBAC.md` §5) |
| **Flags, all default-off** | `SHARE_TAB_MANAGE`, `SHARE_LABELS`, `ASK_PLAYBOOK`, `HOST_PRODUCT` (+ designed `NOTIFICATIONS`) |
| **Proven** | Nothing end-to-end. `eslint`/`build` clean; vitest can't run (Node 16 — see §5); eval loop + E2E never executed (nothing deployed) |
| **Live bug shipped** | `shared_links` has no UPDATE policy → link expiry silently immutable (`SHARING.md` §2). `20240128` fixes it. **This is the one thing already broken in production.** |

**A branch this size does not merge-and-flip.** The milestones below are
the order in which it becomes safe to.

## 0.1 Migration-numbering hazard — fix before applying anything

The tenancy migrations were *numbered* `20240118`–`20240121`
(`ARCHITECTURE.md` §8) before the feature migrations were *written* at
`20240128`–`20240132`. Filename order is apply order, and the live DB is
already past `20240117`. So authoring tenancy at its designed numbers now
would slot four migrations *below* five already-committed ones —
tools either skip "already-passed" versions or error on out-of-order.

The feature migrations do **not** hard-depend on tenancy (properties'
`workspace_id` is a bare nullable `uuid`, no FK; Ask uses
`COALESCE(workspace_id, user_id)`), so this is purely an ordering defect,
not a dependency one. **Fix:** when the tenancy/RBAC waves are written,
number them `20240134`+ (after everything committed), not their original
`2024011x`. `ARCHITECTURE.md` §8's table numbers are a design sketch, not
a filename mandate — flagged here so nobody treats them as one.

---

## 1. The five milestones

Each gate: **entry** (what must be true to start) → **do** (migrations +
flags) → **exit** (what proves it's safe) → **rollback**.

### Pre-M0 — "stop the bleeding" (ships independently of everything)

The one change that is pure fix, no new surface:

- **Do:** apply `20240128` (+ `20240133` search_path, + the snapshot
  generator fix). Optionally flip `SHARE_LABELS` after.
- **Entry:** none — this is lower-risk than the status quo.
- **Exit:** the `HostPropertyFlow` E2E's expiry step passes against
  production (it's written to probe exactly the UPDATE policy this adds);
  a link set to "Until I switch off" survives past midnight.
- **Rollback:** `DROP POLICY shared_links_owner_update` reverts to today's
  (broken) behavior — so rollback is strictly "back to the known bug,"
  which is why this goes first and alone.

**Do this regardless of the platform timeline.** It fixes a live defect.

### M1 — Tenancy live, invisibly, under B2C

The whole platform rests on this, and its success criterion is that
**nobody notices.**

- **Entry:** tenancy + RBAC migrations *written* (renumbered per §0.1) and
  reviewed; the RBAC parity harness (`RBAC.md` §5.1, M3) exists and can run.
- **Do (migration order is load-bearing):**
  1. `CREATE` orgs/workspaces/members + `is_workspace_member()` (no reads yet)
  2. Backfill: 1 personal org + 1 `family` workspace + owner membership per user; update `handle_new_user()` for new signups
  3. `family_invitations` → `workspace_members` sync trigger + backfill
  4. Additive nullable `workspace_id` on guides/packs/shared_links/share_grants, backfilled
  5. RBAC capability tables + seed + `has_capability()` (defined, unused)
  6. **Parity harness in shadow** — prove new capability policies would
     return identical results to the live `user_id` policies, over
     synthetic fixtures incl. the viewer/grants path (which has zero
     production data — `RBAC.md` §7). **Gate: zero diffs.**
  7. Only then: add capability policies alongside the old ones; later, drop
     the superseded ones.
- **No flag flip.** M1 ships no user-visible change by construction.
- **Exit ("didn't break B2C" — see §2):** existing suites green · parity
  harness zero-diff before *and* after policy swap · retention flat · the
  `ARCHITECTURE.md` §7 byte-identical checks (no column dropped/retyped;
  `grep workspace_id src/` still returns nothing — no client reads it yet).
- **Rollback:** every step is additive; reverse order of `DROP`. Because
  no code reads the new tables, rollback at any sub-step is data-only, no
  behavior change. This is the payoff of the bijection design.

### M2 — Ask the Playbook to families

First user-visible platform feature; friendly audience first, per the
sequence's own logic.

- **Entry:** M1 done (Ask's scope check tolerates pre- and post-tenancy via
  `COALESCE`, so strictly it could precede M1 — but families are the
  validation audience and workspace scoping makes the blast radius legible,
  so it goes after). `20240129` applied; `ask-playbook`/`embed-guides`
  deployed with `OPENAI_API_KEY` set.
- **The release-blocking gate:** **run the eval set and set
  `SIMILARITY_THRESHOLD` from the data** (`ASK_PLAYBOOK.md` §10). `0.35` is
  a guess; shipping it uncalibrated is shipping a coin-flip on whether a
  stressed caregiver gets an answer or a refusal. Set `ASK_PLAYBOOK_DEBUG`
  to get `top_distance`; confirm the grounded/should-refuse distance
  classes actually separate (if they don't, the fix is retrieval, not the
  threshold — do not flip the flag).
- **Do:** flip `ASK_PLAYBOOK` (paid family owners' links, per decision #2).
- **Exit:** eval precision/recall on the refusal boundary meets an agreed
  bar; zero grounded answers contain invented specifics (the eval's
  no-invention cases); manual spot-check on a real family playbook.
- **Rollback:** flip the flag off — instant, no data implication
  (embeddings are inert without the surface). The migration can stay.

### M3 — Host alpha, N real owners

- **Entry:** M1 done. `20240130`/`20240131` applied. **Three blockers
  cleared, all recorded:**
  1. **Workspace-type gating made real** — `useHostWorkspace()` reads
     `workspace_type` instead of the flag-only stub (`HOST_SHELL.md` §7.1).
     Until this, flag-on = every account host-eligible.
  2. **Content scoping landed** — host bundles must stop appearing in the
     family Guides tab (`PROPERTIES.md` §6). This is the M1 capability
     policies actually being *read* by `DataContext` — the first time the
     tenancy layer does work, not just exist.
  3. **A host-workspace creation path** — `?vertical=host` (`AUTH_FLOWS.md`
     §5) or manual provisioning for alpha owners.
- **Do:** flip `HOST_PRODUCT` for the alpha cohort only (a per-user gate,
  not the global flag, until confidence). Seed the Host Starter Kit.
- **N:** small enough to hand-hold (recommend **5–10 owners** the team can
  talk to weekly), large enough to see real guest traffic. The number is a
  learning instrument, not a scale test.
- **Exit:** the host E2E passes against production; ≥1 real guest opens a
  real dated link and Ask answers a real question; retention of the
  *family* cohort still flat (proves the second product didn't disturb the
  first); no RLS regression in the shared tables.
- **Rollback:** per-user flag off; host content is inert (it's just bundles
  the owner still sees in the — now scoped — host shell). No family impact
  because scoping (M1) already isolated it.

### M4 — Host billing tier

- **Entry:** M3 stable with real owners; host pricing decided (§4);
  Prompt 17's entitlement design done. **Blocker cleared:**
  `useNativePurchases.js:89` must name its entitlement — today it treats
  *any* active RC entitlement as premium, so a host-only subscriber would
  read as family-premium on device (`MOBILE_SPLIT.md` §2.3).
- **Do:** add host plans to `plans`/`plan_entitlements`; wire host products
  into the existing Stripe + RevenueCat rails and the one `user_billing`
  reconciliation (unchanged — that's the point of the shared spine);
  per-product RC entitlements (`family_premium`/`host_premium`).
- **Exit:** a real owner subscribes and is metered correctly on both rails;
  a family subscriber's entitlement is unaffected (the §2.3 fix, verified);
  the read-only-over-limit downgrade behaves for host content exactly as
  for family (never delete, never brick).
- **Rollback:** disable host plan purchase; existing host subscribers keep
  access (never revoke paid access on rollback).

### M5 — Store split decision

Not an action — a **decision checkpoint** whose criteria are already
recorded (`MOBILE_SPLIT.md` §3). Reached, not executed.

- **Entry:** M4 shipped; host has real, paying usage.
- **Evaluate the trigger:** split when the *first* of (a) store-positioning
  need, (b) host ≥1,000 MAU/60d or ≥25% MRR, (c) store-review friction.
  Expected to fire on (a).
- **Do (only if triggered):** two Vite entries + two Capacitor configs;
  `com.familyplaybook.host` born; one RC project, per-product entitlements.
- **Exit:** both binaries ship from one repo; no user loses access or
  history across the split (family keeps `com.familyplaybook.app` and its
  store identity).
- **Rollback:** the split is additive (a second target) — the combined
  binary remains valid, so "rollback" is just not shipping the second
  target yet.

---

## 2. "Didn't break B2C" — the metrics, defined so they can't be fudged

The constraint every milestone shares. Three signals, each with a concrete
definition and the honest state of whether we can measure it *today*:

| Signal | Definition | Measurable now? |
|---|---|---|
| **Existing suites green** | The vitest unit suites + the two written E2E/eval harnesses pass in CI | ❌ **Not yet** — vitest can't start on the repo's Node 16 (rolldown needs ≥20.12). **This is itself an M1 entry gate:** a platform migration you can't run the test suite against is ungated. Fix Node in CI *before* M1. |
| **Zero RLS regressions** | The RBAC parity harness returns zero diffs before and after each policy change; the 8-table anon-enumeration probe (`DATA_MODEL.md` §6) still returns zero rows | ⚠️ **Partially** — the anon probe runs today (verified 2026-08-11); the parity harness must be *written* (M1 entry) |
| **Retention flat-or-up** | Family cohort's D7/D30 return rate does not drop across any milestone, measured from first-party session data (no SDK — `DECISIONS.md` 2026-08-11) | ⚠️ **Definition-ready, query-deferred** — the "no third-party analytics" decision means this comes from own session data; the exact query is owed whenever a workspace can exist |

**The gate that outranks the others:** M1 must not begin until CI can run
the test suite. Everything else assumes "suites green" is checkable.

---

## 3. Consolidated blocker ledger

Every release blocker recorded across Prompts 0–14, in one place, mapped to
the gate that clears it. This is the punch list.

| # | Blocker | Source | Cleared at | Status |
|---|---|---|---|---|
| B1 | `shared_links` UPDATE policy missing (live expiry bug) | SHARING §2 | **Pre-M0** | fix written (`20240128`), unapplied |
| B2 | 8 definer fns unpinned `search_path` | API §5 | Pre-M0 | fix in flight (`20240133`) |
| B3 | Snapshot marker understates applied migrations | DATA_MODEL D1 | Pre-M0 | fix in flight |
| B4 | CI can't run vitest (Node 16) | ROLLOUT §2 | **M1 entry** | not started — **highest-leverage** |
| B5 | RBAC parity harness unwritten | RBAC §5.1 | M1 | designed |
| B6 | `SIMILARITY_THRESHOLD` uncalibrated | ASK_PLAYBOOK §10 | **M2 gate** | eval set ready, never run |
| B7 | Host workspace-type gating stubbed | HOST_SHELL §7.1 | M3 | stub in place |
| B8 | Host bundles leak into family Guides | PROPERTIES §6 | M3 | needs M1 scoping read |
| B9 | `useNativePurchases` any-entitlement=premium | MOBILE_SPLIT §2.3 | M4 | one-line fix, unwritten |
| B10 | `export_user_data` incomplete (GDPR) | DATA_MODEL F3 | before any public launch | pre-existing |
| B11 | `webhook_events` retains PII post-delete, no FK | DATA_MODEL F1 | before any public launch | pre-existing |

B10/B11 aren't milestone-gated but are **launch**-gated: they're data-
protection debt that predates this work and should be cleared before the
platform is marketed, independent of the host timeline.

## 4. Host pricing — the open decision, with a recommendation

Prompt 17 owns the full design; this synthesis states the decision and a
recommendation so M4 isn't blocked on a blank page.

**The question:** what does a host pay for, and per what unit?

**Recommendation — meter on properties, with Alfred as the value story:**

- **Tiers:** *Free* (1 property, guest links, no Alfred) · *Host* (~3–5
  properties, Alfred on guest links, team seats) · *Host Pro* (unlimited
  properties, priority Alfred). Exact numbers are Prompt 17's.
- **Meter on properties, not guests or questions.** A property is the unit
  an owner intuitively counts and the unit that maps 1:1 to a bundle
  (`PROPERTIES.md` §1); metering guest opens or Alfred questions would tax
  the owner for *their guests'* behavior, which is backwards — guest
  activity is the value delivered, not a cost to ration. (Alfred *rate*
  limits per link for abuse — `ASK_PLAYBOOK.md` — but that's safety, not
  pricing.)
- **Reuse the read-only-over-limit philosophy:** over the property cap,
  extra properties go read-only (guests still see existing links), never
  deleted — identical to the family tier model, so no new enforcement code.
- **Org-level billing** (`ARCHITECTURE.md` §6, Prompt 17): one org with
  many property-workspaces pays once — the `organizations` entity exists
  for exactly this.

**Why not the alternatives:** per-guest or per-question pricing punishes
success and needs metering infra the no-SDK posture avoided; a flat
single tier leaves the multi-property professional (the willing payer)
under-monetized. Recommendation is properties-metered, 3 tiers, org-billed.
**Open sub-question for Prompt 17:** trial length and whether Alfred is the
paywall line or a Pro-only sweetener — lean paywall line (it's the
differentiated value and the referral surface).

---

## 5. Ledger — final state

Prompts 0–15 of the core sequence are complete; the Ledger is at the
planned end state for the platform *design*. What remains is **execution,
not design**: write the tenancy/RBAC migrations (renumbered per §0.1),
clear the §3 punch list in gate order, and run the milestones.

The three documents stay live past this point:
- **`DECISIONS.md`** — append-only; every future execution choice appends.
- **`TENANCY.md`** — the snapshot; updated as migrations actually apply
  (status marks flip 📐→🔶→✅).
- **`GLOSSARY.md`** — canonical names; updated when new nouns appear.

The remaining prompts (16 Airbnb import, 17 host pricing, 18 Alfred owner
loop) are **feature designs that build on this foundation**, not
foundation work — they slot in at M3–M4 without changing the rollout
spine above.

**One sentence for an acquirer:** the platform is fully designed and
half-built behind flags, every decision and every known defect is written
down, and the path to shipping it is a punch list with gates — not a
research project.
