# Host Pricing — on the Existing Entitlement Rails

**Status:** Design + entitlement rows + test list. No migration written
(host billing is `ROLLOUT.md` **M4**, after tenancy M1 and host-alpha M3).
Deliverable of Prompt 17. Read [`ROLLOUT.md`](ROLLOUT.md) §4 (the pricing
recommendation this expands), [`CONTENT_ENGINE.md`](CONTENT_ENGINE.md) (the
read-only-over-limit ordering dependency), and `MOBILE_SPLIT.md` §2.3 (the
RevenueCat entitlement hazard) first.

---

## 1. The thesis: 4 meters, 1 new key

The family product already meters on numeric `plan_entitlements` rows
(`feature_key`, `feature_value_int`, `is_unlimited`), resolved by
`get_user_numeric_limit()` and enforced two ways: **hard caps** at the
write (invite blocked at `editors_max`) and **read-only-over-limit** (the
`is_guide_editable`/`is_pack_editable` RESTRICTIVE policies rank content by
`updated_at DESC` and freeze everything past the cap — never delete, never
brick). Host pricing meters four things, and **three of them are existing
keys**:

| Host meter | `feature_key` | New? | Enforcement — reused verbatim |
|---|---|---|---|
| **Guides** (per workspace) | `active_guides_max` | reused | `is_guide_editable` — over-cap guides go read-only |
| **Properties** | `bundles_max` | reused | `is_pack_editable` — a property *is* a bundle (`PROPERTIES.md` §1), so over-cap properties go read-only |
| **Team seats** | `editors_max` | reused | `send-family-invite`'s existing `editors_max` count check blocks the N+1 invite |
| **Alfred questions / month** | `alfred_questions_max` | **NEW** | the one new enforcement path (§3) |

So the entire host-content metering is **existing enforcement code with
different numbers in the rows.** That is the point of building the family
tier model well: the second vertical prices itself on the first vertical's
machinery.

**Recorded naming debt:** `bundles_max` doing double duty as the property
cap conflates two product nouns (a diligence reader will notice). The
alternative — a new `properties_max` key + a new `is_property_editable`
function — buys clarity at the cost of a parallel enforcement path that
can drift from `is_pack_editable`. Reuse wins here for the same reason
`GLOSSARY.md` won't rename `packs`: the mechanism is shared, so the meter
should be too. Documented, not renamed.

## 2. The tiers

Three host tiers. **Prices are go-to-market decisions (A/B this) — the
metering *math* is the design; the dollar figures are anchors.**

| | **Host Free** | **Host** | **Host Pro** |
|---|---|---|---|
| Price (anchor) | $0 | ~$15/mo | ~$39/mo |
| **Properties** (`bundles_max`) | 1 | 5 | ∞ |
| **Guides** (`active_guides_max`) | 15 | 100 | ∞ |
| **Team seats** (`editors_max`) | 0 | 3 | 15 |
| **Alfred / month** (`alfred_questions_max`) | 0 (off) | 300 | 3000 |
| Guest links, QR, iCal sync | ✅ | ✅ | ✅ |

### 2.1 The metering math (why these numbers)

- **Properties 1 / 5 / ∞** — the tier boundary is the *shape* of the host:
  Free = "try it with my one place"; Host = the typical multi-listing
  owner (US STR owners average ~2–3 listings; 5 covers the long tail
  comfortably); Pro = property managers, for whom "unlimited" is the
  product. Metering on properties (not guests) is deliberate:
  `ROLLOUT.md` §4 — you never tax an owner for their *guests'* behavior;
  guest activity is the value delivered, not a cost to ration.
- **Guides 15 / 100 / ∞** — 15 comfortably exceeds the ~10-guide Starter
  Kit (`PROPERTIES.md` §4), so a Free owner reaches a *complete* single-
  property playbook without hitting the cap — the cap bites only on the
  *second* property's worth of content, which is exactly when they should
  consider Host. 100 = ~20 guides × 5 properties.
- **Team seats 0 / 3 / 15** — Free is solo (the read-only Helper/cleaner
  grant model still works for *viewing*, but inviting a teammate is a paid
  action). 3 = a cleaner + a co-host + one spare; 15 = a manager's roster.
  Reuses `editors_max`, so "seat" and family "editor" are one meter.
- **Alfred 0 / 300 / 3000/month** — Free excludes Alfred entirely (it's the
  differentiated value and the paywall line, per `ROLLOUT.md` §4). 300/mo ≈
  10 guest questions/day across a 5-property portfolio — generous for real
  traffic. 3000 for Pro's scale. This is a *soft monthly* cap (§3), not a
  content cap — over it, Alfred refuses politely, it never deletes.

### 2.2 What "downgrade" does — the read-only philosophy, unchanged

A Host→Free downgrade with 4 properties does **not** delete 3. The oldest-
by-`updated_at` property past cap #1 goes **read-only**: its guest links
keep resolving (guests still get in — the whole point), Alfred still
answers within the month's remaining quota, but the owner can't edit it or
add guides until they re-subscribe or delete a property themselves. Byte-
identical to the family tier's `is_pack_editable`/`is_guide_editable`
behavior (RBAC test T30's semantics: read-only ≠ undeletable). **Zero new
downgrade code** — the RESTRICTIVE policies already do this; host just has
rows that make them bite at host numbers.

## 3. Alfred questions/month — the one new meter

Not a content cap (nothing to freeze) and not per-link (that's the abuse
rate-limit, `ASK_PLAYBOOK.md`). This is a **monthly quota on the owner's
plan**, checked at the anonymous `ask-playbook` entry:

1. `resolve_ask_scope()` already returns the link's `owner_id` and
   `is_paid`. Extend it to also resolve the **owner's plan's**
   `alfred_questions_max` (via the org, §4).
2. Before answering, sum `ask_playbook_usage.question_count` for the
   owner's links over the current calendar month. **No new table** —
   `ask_playbook_usage` is already the hour-bucketed counter
   (`ASK_PLAYBOOK.md` §4); the monthly sum is a query over it.
3. At/over cap → refuse with a distinct `reason: 'owner_quota'` and a
   guest-appropriate message ("The host's assistant is taking a break —
   message your host directly"). Counts-only privacy holds; the guest
   never learns it's a billing limit.
4. Resets by calendar month (the sum's date filter), no cron, no state.

This reuses the counts already written, adds one plan-limit read and one
comparison. The refusal is a *product state* (like every other Alfred
refusal), so the UI already renders it.

## 4. Org-level billing — one org, many workspaces, one bill

The requirement: an org with many workspaces pays once. The mechanism ties
directly into the tenancy design without changing `user_billing`'s key
(the note DATA_MODEL/TENANCY already reserved):

- **The billing entity is the `organization`.** One org = one subscription.
  `user_billing` stays keyed by `user_id` — specifically the org's
  **billing owner** (`organizations.created_by`). The org doesn't get its
  own billing table; it *points at* its owner's existing `user_billing`
  row. Minimal surface, no reconciliation change.
- **Entitlement resolution moves from user to workspace→org.** A new SD
  helper mirrors the existing one:

  ```sql
  get_workspace_numeric_limit(p_workspace_id uuid, p_feature_key text)
    -- workspace → organization_id → organizations.created_by
    --           → user_billing.plan_key → plans → plan_entitlements
    -- returns feature_value_int, or NULL for unlimited (same contract as
    -- get_user_numeric_limit)
  ```

- **The existing read-only functions switch to it.** `is_guide_editable`/
  `is_pack_editable` today rank by `user_id` and call
  `get_user_numeric_limit(owner)`. `CONTENT_ENGINE.md` **already flags**
  that they must move to `workspace_id` ranking before any non-owner can
  create content — org billing lands on that *same* scheduled change, not
  a new one. Post-change: content ranks within its workspace, and the cap
  comes from the workspace's org's plan. So a 5-property cap spans the
  org's workspaces, and a manager's guide counts against the *org's*
  quota, not the manager's own (free) plan.
- **Family is byte-identical.** A personal org (`is_personal = true`) has
  one workspace whose `created_by` is the same user, so
  `get_workspace_numeric_limit` resolves to exactly `get_user_numeric_limit`
  today returns. No family behavior changes — the same byte-identical
  guarantee as every tenancy step (`ARCHITECTURE.md` §7).

## 5. Stripe + RevenueCat wiring — existing rails, new rows

No new billing infrastructure. Host plans are `plans` rows with new
`plan_key`s (`host_free`/`host`/`host_pro`); the rest is the reconciliation
spine unchanged (`DECISIONS.md` 2026-07-16):

- **Web (Stripe):** new `stripe_price_map` rows (`plan_key`,
  `billing_interval` → `stripe_price_id`) for the two paid host tiers,
  monthly + yearly. `create-checkout-session`/`change-subscription-plan`
  already resolve price by `(plan_key, interval)` — they work unchanged.
- **Native (RevenueCat):** new store products mapped to `plan_key` via the
  existing `RC_PRODUCT_*` env convention; the `revenuecat-webhook` writes
  `user_billing.plan_key` exactly as it does for family. **One RC project,
  per-product entitlements** (`family_premium`/`host_premium` —
  `MOBILE_SPLIT.md` §2.3).
- **BLOCKER, carried from `MOBILE_SPLIT.md` §2.3:** `useNativePurchases.js:89`
  treats *any* active RC entitlement as premium. It **must** be fixed to
  name its entitlement before host products exist in RC, or a host
  subscriber reads as family-premium (and vice versa) on device. This is
  an M4 entry gate, restated here because it lives in the billing path.
- **`user_billing` reconciliation unchanged.** Both rails write the one
  row; `plan_key` carries host-ness; `billing_provider` records the rail.
  The read-only-over-limit logic keys off `plan_key → plans →
  plan_entitlements` regardless of which rail paid.

## 6. Entitlement rows (design — SQL sketch, not a written migration)

Ships as part of the M4 migration. `plans` gains three rows; here are the
`plan_entitlements` for the paid tiers (Free shown for contrast; `∞` =
`is_unlimited = true`, `feature_value_int` NULL):

```sql
-- plans: host_free, host, host_pro (plan_key UNIQUE, per 20240108)
-- plan_entitlements (plan_id, feature_key, feature_value_int, is_unlimited):

-- Host Free
(host_free, 'bundles_max',           1,    false),  -- 1 property
(host_free, 'active_guides_max',     15,   false),
(host_free, 'editors_max',           0,    false),  -- solo
(host_free, 'alfred_questions_max',  0,    false),  -- Alfred off
(host_free, 'ai_generation',         3,    false),  -- shared AI taste, as family free

-- Host  (~$15/mo)
(host,      'bundles_max',           5,    false),
(host,      'active_guides_max',     100,  false),
(host,      'editors_max',           3,    false),
(host,      'alfred_questions_max',  300,  false),
(host,      'ai_generation',         NULL, true),   -- unlimited AI structuring

-- Host Pro  (~$39/mo)
(host_pro,  'bundles_max',           NULL, true),   -- ∞ properties
(host_pro,  'active_guides_max',     NULL, true),
(host_pro,  'editors_max',           15,   false),
(host_pro,  'alfred_questions_max',  3000, false),
(host_pro,  'ai_generation',         NULL, true);
```

`stripe_price_map` gains `(host, month)`, `(host, year)`, `(host_pro,
month)`, `(host_pro, year)` → real Stripe price ids at wire-up time.

## 7. Enforcement test list

Grouped by mechanism. Every "over cap" test asserts **read-only, never
deleted** unless noted.

### A. Properties (`bundles_max` via `is_pack_editable`)
- P1: Host owner with 5 properties on Host tier — all 5 editable.
- P2: Same owner downgraded to Free (cap 1) — the 4 newest-by-`updated_at`
  become read-only; the oldest stays editable; **all 5 still exist**, all
  guest links still resolve.
- P3: Read-only property — owner cannot add a guide to it or edit it, but
  **can delete it** (read-only ≠ undeletable, RBAC T30).
- P4: After deleting down to 1, the remaining property becomes editable
  again (the rank window frees up).

### B. Guides (`active_guides_max` via `is_guide_editable`)
- G1: Workspace at 100 guides on Host — all editable; the 101st insert is
  blocked by the RESTRICTIVE policy, not silently accepted.
- G2: Downgrade Host→Free (15) — newest-16-and-beyond read-only, oldest 15
  editable.

### C. Team seats (`editors_max` via `send-family-invite`)
- S1: Host tier (3 seats), 3 accepted/pending members — the 4th invite
  returns `LIMIT_REACHED` (existing code path, host numbers).
- S2: Free tier (0 seats) — any team invite is refused; existing **view**
  grants to already-joined members are unaffected (grants ≠ seats).

### D. Alfred monthly quota (`alfred_questions_max`, new)
- A1: Host owner's links at 300 answered this month — the 301st guest
  question refuses with `reason: 'owner_quota'`, **no LLM call** (cost
  saved), counts still recorded.
- A2: Refusals do **not** consume quota beyond their count — a
  below-threshold refusal (`isGrounded` false) increments the counter but
  the quota compares against `question_count`, so the design must decide:
  **quota counts questions asked, not answered** (chosen — matches the
  per-link rate limit's basis and can't be gamed by asking unanswerable
  things). Test asserts an over-quota owner refuses regardless of grounding.
- A3: New calendar month — the sum resets, Alfred answers again, no cron
  ran.
- A4: Free-tier owner (cap 0) — Alfred never offered (`ask_playbook_available`
  returns false); the affordance doesn't render (decision #2 posture).

### E. Org-level (`get_workspace_numeric_limit`)
- O1: One org, 2 host workspaces, Host tier — the 5-property cap is the
  **org total**, not 5-per-workspace.
- O2: A manager (non-owner) creates a guide in the org — it counts against
  the **org's** `active_guides_max`, not the manager's personal free plan.
- O3: Org downgrade — oldest content across **all** the org's workspaces
  goes read-only by global `updated_at` rank, not per-workspace.
- O4: **Family regression** — a personal-org family user's caps are
  identical before and after `get_workspace_numeric_limit` replaces
  `get_user_numeric_limit` (byte-identical; part of the M1 parity harness).

### F. Reconciliation (Stripe + RC)
- R1: Host web subscriber (Stripe) — `user_billing.plan_key = 'host'`,
  caps apply.
- R2: Host native subscriber (RC) — same `plan_key` via webhook; **and**
  the device correctly shows host-premium, not family-premium (the §5
  `useNativePurchases` fix — the regression this gates on).
- R3: A user with both a family and a host entitlement (edge case: bought
  both) — `user_billing` reflects the reconciled truth; each app reads its
  own entitlement, neither bleeds into the other.

## 8. Open decisions

- **Final prices** — $15/$39 are anchors; A/B at launch.
- **Trial** — recommend a 14-day Host trial (no Alfred cap during trial,
  to make the value land), lapsing to Host Free. Prompt-for-Prompt-17
  didn't specify; flagged.
- **Yearly discount** — the `billing_interval` machinery supports it
  (family already has month/year); recommend ~2 months free on annual,
  matching family.
- **Does Free include Alfred at a tiny cap (e.g. 10/mo) instead of 0?** —
  tension between "Alfred is the paywall line" (ROLLOUT §4) and "let them
  taste it." Lean **0** (a taste that runs out mid-guest-stay is worse
  than none), but this is the single most testable pricing hypothesis —
  A/B it first.
