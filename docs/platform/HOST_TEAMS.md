# Host Teams & Analytics v1

**Status:** Teams = design (blocked on the unapplied tenancy/RBAC
migrations, and honest about it). Analytics = one shipped pure library +
a wiring plan against existing tables only. Deliverable of Prompt 10.
Read [`RBAC.md`](RBAC.md) (the roles this consumes),
[`PROPERTIES.md`](PROPERTIES.md) (the property model), and
[`SHARING.md`](SHARING.md) §5 / [`ASK_PLAYBOOK.md`](ASK_PLAYBOOK.md) §4
(the counters analytics reads) first.

---

## 1. Teams: the existing invite machinery, two new role values

**What is reused wholesale** — the entire invitation *workflow*:
`family_invitations` (unguessable token, email-bound acceptance, 14-day
TTL, decline/removed history), the `send-family-invite` /
`accept-family-invite` edge functions, and `ARCHITECTURE.md` §3.3's sync
trigger that projects accepted invitations into `workspace_members`. A
manager or cleaner joins a host workspace **exactly** the way an Adult
joins a family one. No parallel invite system.

**The actual delta is two role values, and it is smaller than it looks:**

1. `family_invitations.role` has `CHECK (role IN ('viewer','editor'))`
   (`schema.sql:48`) — one additive `ALTER` widens it to include
   `'manager'` and `'cleaner'`.
2. `send-family-invite` validates `role ∈ {viewer, editor}` in code
   (`index.ts:16-18`) — the allowed set becomes vertical-aware (family
   invites still only offer viewer/editor; host invites offer
   manager/cleaner).
3. The sync trigger copies `role` **verbatim** into `workspace_members`,
   whose validity trigger (`RBAC.md` §2.2) already rejects a `cleaner` in
   a `family` workspace — so the vertical boundary is enforced at the
   membership layer, not re-implemented in the invite layer.

**Why widen the CHECK instead of mapping values down** (e.g. manager →
`editor`): mapping loses information that RBAC's matrix needs. Cleaner ≡
viewer *is* a clean identity (`RBAC.md` §3.1 — identical capability
rows), but **manager ≢ editor**: manager holds `share.grant.manage`,
`member.invite` and `content.create`, none of which family:editor has. A
value-mapped manager would arrive in `workspace_members` as an editor and
silently lose three capabilities. Roles are data; the data must carry the
real role.

**Cleaners get task-relevant guides only — and the picker already
exists.** Cleaner's only content capability is `content.view.granted`
(`RBAC.md` §3), enforced by the same `share_grants` +
`viewer_can_see_guide()` machinery as the family Helper — reused verbatim,
per RBAC's "same shape" payoff (§3.1). The per-person grant-picker UI
built in `ShareCenterScreen.jsx:209-268` — fully implemented and currently
unreachable because nothing creates viewer invitations (`RBAC.md` §7) —
becomes the host Team tab's "what does ⟨cleaner⟩ see" surface. The first
real user of that dormant code path is a cleaner, not a Helper.

**Status: design only.** Every table this depends on
(`workspaces`, `workspace_members`, the RBAC capability tables) is
designed and unapplied. Shipping the CHECK-widening migration alone would
be dead schema (the edge function rejects the values; no UI sends them),
so the migration ships with the RBAC wave, not here. The Team tab keeps
its Prompt 8 skeleton.

## 2. Analytics v1: three numbers per property, zero new infrastructure

The constraint — *strictly from existing data* — holds literally: no new
table, no counter, no event, no rollup, no SDK (§4). Every number joins
off `properties.bundle_id`.

| Number | Source | Join | Migration it needs |
|---|---|---|---|
| **Link opens** | `shared_links.opened_count`, `last_opened_at` | `bundle_id = property.bundle_id`, summed | `20240128` (unapplied) |
| **VA asked / refused** | `ask_playbook_usage.question_count`, `refusal_count` | `share_id → shared_links → bundle_id` | `20240129` (unapplied) |
| **Coverage** | client-side, `detectPropertyCoverage()` | the bundle's guides, already loaded | none |

All owner-side reads pass existing RLS (`shared_links_owner_select`,
`ask_usage_owner_select`) — no new policy.

### 2.1 Correction to the prompt's premise, recorded

Prompt 10 says VA questions come from "the ai ledger". **They don't, and
can't**: `ai_generations` is keyed by `user_id` and `ask-playbook`
deliberately never writes it for guests — guests are anonymous, and
Prompt 7's decision #4 (counts-only, never question text, hour-bucketed)
put guest activity in `ask_playbook_usage` instead
(`ASK_PLAYBOOK.md` §3–4). The refusal counter half of that table exists
*specifically* for this prompt's and Prompt 18's consumption. The premise
was written before Prompt 7 resolved the design; superseded, not wrong.

### 2.2 Coverage: the gap-filler pointed at the host taxonomy

`src/lib/hostCoverage.js` (shipped) mirrors `gapDetection.js`
deliberately — deterministic keyword matching, no AI, no network. Nine
essential topics ≡ the Host Starter Kit minus the "Just ask" explainer
(meta-content; its absence strands no guest). Each topic carries a
`starter` template so "Add it" drops straight into the guide editor, the
same one-tap flow `HomeNudge` uses.

**One deliberate inversion of the family rule:** `detectGaps` never
greets an empty account; `detectPropertyCoverage` reports an empty
playbook as 0/9 **on purpose**. The family rule protects a brand-new user
from being nagged; a host who just created a property is in the opposite
moment — coverage *is* the to-do list that walks them to a complete
playbook. `byCategory` rollups (Arrival/House/Local/Departure) feed a
per-category meter without any further computation.

### 2.3 Where it surfaces

`HostPropertyDetail` gets a coverage meter + the two counters;
the KPI header's per-property drill-down stays out of scope. **Not wired
in this prompt:** `HostPropertyDetail.jsx` is being written by Prompt 9's
in-flight build — wiring analytics into a file mid-edit by another task
would collide, so the surface lands on the next touch of that file, with
`hostCoverage.js` ready and tested for it. (This sequencing note is the
kind of thing the Ledger exists to remember.)

## 3. Files

| File | What |
|---|---|
| `src/lib/hostCoverage.js` | `HOST_ESSENTIAL_TOPICS` + `detectPropertyCoverage()` — shipped |
| `src/__tests__/hostCoverage.test.js` | 10 vitest cases incl. the self-coverage invariant (every starter satisfies its own topic regex — a starter that didn't would nag forever). Runner still blocked (Node v16). |
| `docs/platform/HOST_TEAMS.md` | this design |
| *(deferred)* | role-CHECK widening migration — ships with the RBAC wave (§1) |

## 4. No third-party analytics SDK

Recorded as its own Ledger decision, per the prompt. Short version: every
number above derives from first-party rows the user's own product actions
already write; adding PostHog/Amplitude/Firebase would add SDK weight, a
consent surface, App Store privacy-label declarations, and a third party
holding guest behavior that includes health-adjacent questions ("can Ella
have peanuts") — against `ASK_PLAYBOOK.md` §3's explicit privacy floor.
The App Store privacy posture stays clean because there is nothing to
declare.
