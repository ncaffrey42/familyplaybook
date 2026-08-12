# Platform Build-Out: The Prompt Sequence

Family Playbook is becoming a **multi-product platform**: the existing family
(B2C) product stays untouched, and a **Host** product (short-term-rental
owners → guest guides → an AI concierge guests can ask questions) grows beside
it on shared services. Built to the standard of a company that could be
acquired: clean tenancy, real RBAC, documented APIs, auditability.

**How to use this file:** paste one prompt at a time into a session. Every
prompt ends by updating the **Platform Ledger** (see Prompt 0), so each
prompt builds on recorded decisions instead of re-deriving them. Don't skip
Prompt 0.

---

## What already exists (do NOT rebuild — extend)

The prompts below are written against this reality:

| Capability | State today |
|---|---|
| Auth (email, Google/Facebook/Discord/Apple), native OAuth deep-links | ✅ built |
| Content engine v1: guides (steps jsonb), bundles (`packs` + ordered `pack_guides`), media uploads | ✅ built |
| Sharing: unguessable links w/ **expiry presets**, QR codes, per-person grants, family invites + roles (viewer/editor), helper read-only view | ✅ built |
| AI: voice/text→guide, AI handoff-bundle assembly, per-plan quotas ledger | ✅ built |
| AI Q&A over shared content ("Ask the Playbook" / Alfred) | 🔨 **built by Prompt 7, unproven** — code + evals written; nothing deployed, no migration applied, grounding threshold uncalibrated. See `docs/platform/ASK_PLAYBOOK.md` §10 |
| Billing: Stripe (web) + RevenueCat IAP reconciled into one `user_billing` | ✅ built |
| Feedback system, freshness/gap nudges, feature-flag pattern (`VITE_*`) | ✅ built |
| Mobile: Capacitor iOS/Android shells, brand system | ✅ built |
| Tenancy above the user (orgs/workspaces), host vertical, RBAC beyond family roles | ❌ **the gap this sequence fills** |

Stack: React 18 + Vite + Tailwind (brand v1) · Supabase (Postgres/RLS, Deno
edge functions, migrations + schema snapshot) · Capacitor 6 · pg RLS is the
security boundary everywhere.

**The non-negotiable constraint, repeated in every prompt:** the B2C family
product keeps working unchanged at every step. New tenancy wraps existing
data via backfill (every user gets a personal "Family" workspace); nothing
user-visible changes until a flag flips.

---

## Prompt 0 — The Platform Ledger (paste first, once)

> Create the Platform Ledger for this repo: a `docs/platform/` directory with
> three files that every future architecture prompt must read first and
> update last. (1) `DECISIONS.md` — append-only log of architectural
> decisions: date, decision, why, alternatives rejected. Seed it with the
> already-made decisions visible in this codebase: Supabase/RLS as the
> security boundary, one shared `user_billing` across payment providers,
> share-links resolved only through SECURITY DEFINER RPCs, feature flags via
> `VITE_*` env, migrations + generated `supabase/schema.sql` snapshot as
> schema source of truth. (2) `TENANCY.md` — the evolving org/workspace/role
> model (empty scaffold now). (3) `GLOSSARY.md` — canonical names (playbook,
> guide, bundle, workspace, organization, property, helper, guest…), because
> the code says `packs` where the product says `bundles` and an acquirer's
> diligence team will ask. Commit it. Every subsequent prompt in
> PLATFORM_PROMPTS.md ends with: "update the Platform Ledger with new
> decisions, tables, and terms before finishing."

---

## Phase A — Foundations (Prompts 1–4)

### Prompt 1 — Platform architecture & workspace abstraction
> Read docs/platform/ first. Design the multi-product platform architecture
> for this repo as an ARCHITECTURE.md + migrations plan (design only, no
> code): introduce `organizations` (billing + identity boundary),
> `workspaces` (content boundary; an org has many), `workspace_members`
> (user × workspace × role), and `workspace_type` as a **generic vertical
> discriminator** — `family` and `host` now, but designed so future verticals
> (real-estate, schools, elder-care) are a new type + role-set + app shell,
> not a schema change. Map today's data into it: every existing user gets a
> personal org + one `family` workspace; `guides`/`packs`/`shared_links`/
> `share_grants` gain a `workspace_id` via additive, backfilled migration;
> existing `family_invitations` become workspace memberships. Define the API
> boundary rule: edge functions and RLS scope by workspace, never by raw
> user, with a compatibility layer so current clients keep working. State
> explicitly how the B2C app remains byte-identical in behavior during and
> after the migration. Update the Ledger.

### Prompt 2 — Auth flows & workspace switcher
> Read docs/platform/. Audit the existing auth (email/password, magic link,
> Google/Facebook/Discord/Apple, native deep-links, invite returnTo) and
> specify the delta only: post-login workspace resolution (last-active,
> else personal), a workspace switcher in the account header (only rendered
> when >1 workspace), org-level invites vs the existing workspace-level
> invites, and how registration chooses a starting vertical (family default;
> host via a "For hosts" entry point). Registration, password reset, and all
> current flows must be regression-listed, not redesigned. Deliverables:
> AUTH_FLOWS.md with sequence diagrams, the switcher component spec, and a
> test matrix. Update the Ledger.

### Prompt 3 — RBAC unification
> Read docs/platform/. Design one permission model that expresses both
> verticals' roles as data, not code forks: family — owner, adult (editor),
> helper (viewer, today's grants model); host — owner, manager, cleaner,
> guest (anonymous, link-scoped). Define a `role` → capabilities matrix
> (view/edit/share/admin/billing per resource type), how the existing
> `share_grants` per-person model and helper read-only view slot in
> unchanged, and the RLS pattern (one `has_capability(workspace_id,
> capability)` SECURITY DEFINER helper replacing per-table role checks over
> time — additively, old policies stay until parity is proven). Deliverable:
> RBAC.md with the full matrix + migration plan + adversarial test list
> (viewer must never write; guest must never enumerate). Update the Ledger.

### Prompt 4 — Shared content engine v2
> Read docs/platform/. The content engine (guides/steps, bundles with
> ordering, attachments, media, AI generation) already works for families.
> Specify the generalization delta so hosts reuse it wholesale: content
> belongs to a workspace (not a user); `category` becomes per-vertical
> taxonomy data (family: How To/Find It/Reference; host: Arrival/House/
> Local/Departure); "playbook" is formalized as the workspace's content root
> in GLOSSARY terms; attachments/media policy (private buckets + signed
> URLs) gets a remediation plan (today's public-URL media is a known debt —
> record it as a Ledger decision with a migration path, do not block on it).
> No UI changes in this prompt. Update the Ledger.

## Phase B — Consumer product hardening (Prompts 5–7)

### Prompt 5 — Consumer dashboard & navigation
> Read docs/platform/. The family app's 3-tab nav (Home/Guides/Share) is
> shipped and stays. Specify only: where "My Family" (member management,
> today buried in Settings → Family & Friends) surfaces in the Share tab,
> how the workspace switcher appears for multi-workspace users without
> adding a 4th tab, and the Home card priority rules (share card > gap >
> freshness — already built; document as the canonical pattern). Deliverable:
> NAV.md + at most 2 small UI changes with flags. Update the Ledger.

### Prompt 6 — Temporary sharing, unified
> Read docs/platform/. Expiring links (Tonight/Weekend/Until-off), QR codes,
> per-person grants, and the helper view are built. Specify the delta:
> arbitrary expiry (date-picker) for host stays, link "labels" (who it's
> for), a per-link access log (opened count/last opened — the retention
> signal owners actually want), and share-event notifications as integration
> points only (no push infra yet — Ledger-record the channel plan).
> Deliverable: SHARING.md + the small migration (labels + access log) +
> flagged UI. Update the Ledger.

### Prompt 7 — AI Q&A ("Ask the Playbook" → guest concierge)
> Read docs/platform/ and SPEC_ASK_PLAYBOOK.md (already written, decisions
> pending). Revise that spec for the platform: retrieval scope = exactly one
> workspace's shared content, grounding threshold + mandatory citations +
> refusal discipline as specced, pgvector embeddings, per-share-link rate
> limits. Add the host framing: this same surface IS the guest VA on guest
> guide links ("what's the wifi?" at 11pm). Resolve the spec's four open
> decisions with platform defaults (share-page surface now; available on
> paid owners' links; ~20/hr/link; counts-only analytics). Then implement
> per the spec's eval-driven plan. This is the biggest single build in the
> sequence — budget it accordingly. Update the Ledger.

## Phase C — The Host product (Prompts 8–10)

### Prompt 8 — Host app shell
> Read docs/platform/. Design the Host product as a second app shell on the
> same codebase and services: route namespace `/host`, its own 3-tab nav
> (Properties / Guides / Team or similar — propose from host jobs-to-be-done),
> host workspace type gating, and the KPI header an owner sees (active
> properties, live guest links, questions answered by the VA this week —
> only KPIs derivable from existing tables; no new analytics infra).
> Brand: same design system, differentiated accent. Feature flag
> VITE_ENABLE_HOST_PRODUCT, default off. B2C users never see any of it.
> Deliverable: HOST_SHELL.md + skeleton routes behind the flag. Update the
> Ledger.

### Prompt 9 — Properties + guest guide builder
> Read docs/platform/. Design + build `properties` (CRUD, address, photo,
> per-property playbook = a bundle-per-property convention on the existing
> content engine), the guest-guide builder (reuses the guide editor +
> AI generation wholesale; host taxonomy from Prompt 4), per-property guest
> link + printable QR sheet (reuse link-ready screen + expiry + the
> existing QR), and check-in/check-out date-scoped links (Prompt 6's
> arbitrary expiry). Seed a **host starter library** by reusing the existing
> library infrastructure (library_packs/library_guides + the copy-to-mine
> flow already built for families): ~10 ready-made host guides (wifi,
> check-in, checkout, parking, appliances, house rules, local picks, trash,
> emergencies, "ask Alfred" explainer) so a new owner reaches a complete
> playbook in minutes. Deliverable: migrations + flagged UI + an E2E: create
> property → build guide → generate dated guest link → guest view works,
> expires. Update the Ledger.

### Prompt 10 — Host teams & analytics
> Read docs/platform/. Managers and cleaners join a host workspace via the
> existing invite machinery (Prompt 3 roles); cleaners get task-relevant
> guides only (grants model reused). Analytics v1 strictly from existing
> data: link opens (Prompt 6 log), VA questions asked/refused (ai ledger),
> guide coverage per property (gap-filler logic, host taxonomy). No
> third-party analytics SDK — Ledger-record that decision (App Store
> privacy posture stays clean). Update the Ledger.

## Phase D — Platform maturity (Prompts 11–15)

*(Phase E prompts 16–18 below interleave: 16 after 9, 17 before 15, 18 after 7+16.)*

### Prompt 11 — Search, notifications, messaging seams
> Read docs/platform/. Global search across a workspace (extend the existing
> client search to server-side pg trigram/FTS when content outgrows the
> client), a `notifications` table + in-app inbox as the ONE seam future
> channels (push/email) plug into (the feedback fan-out pattern is the
> template), and messaging as integration points only (webhook-out
> definitions, no chat build). Update the Ledger.

### Prompt 12 — Mobile navigation & the two-app future
> Read docs/platform/. Specify how one Capacitor codebase ships both
> products now (workspace switcher decides shell) and the clean split path
> later (two app targets, shared core package, same bundle ids strategy,
> RevenueCat entitlements per product). Decide and Ledger-record the
> trigger condition for splitting (e.g., host MAU threshold or App Store
> positioning need). No build — this is a decision document an acquirer
> reads. Update the Ledger.

### Prompt 13 — Full schema + ERD
> Read docs/platform/. Generate the canonical data model doc: ERD (mermaid)
> of every table incl. the new tenancy layer, each table's owner-boundary
> (org / workspace / user / global), RLS posture summary, and retention/
> deletion semantics (tie into the existing delete-account cascade).
> Cross-check against the live `supabase/schema.sql` snapshot — any drift is
> a bug to file. This becomes DATA_MODEL.md, the diligence document. Update
> the Ledger.

### Prompt 14 — API surface spec
> Read docs/platform/. Document every edge function and RPC as an API spec
> (OpenAPI-ish markdown): auth model, inputs, outputs, error codes, rate
> limits, idempotency, and which are public (share resolution, VA) vs
> authenticated vs webhook. Define the versioning rule for breaking changes
> (new function name, never mutate a deployed contract — matches what the
> Stripe/RevenueCat webhooks already do). Deliverable: API.md. Update the
> Ledger.

### Prompt 15 — MVP milestones & rollout
> Read docs/platform/ (all of it — this prompt synthesizes). Produce the
> rollout plan: milestone gates (M1 tenancy live invisibly under B2C, M2
> Ask-the-Playbook to families, M3 host alpha with N real owners, M4 host
> billing tier, M5 store split decision), each with entry/exit criteria,
> flag flips, migration order, rollback plan, and the metrics that prove
> "didn't break B2C" (existing E2E suites green, zero RLS regressions,
> retention flat-or-up). Include the pricing question for hosts as an open
> decision with a recommendation. Update the Ledger — final state.

### Prompt 16 — Airbnb connect & listing import (run after Prompt 9)
> Read docs/platform/. Design the "connect your listing" flow with honest
> API constraints, recorded in the Ledger: Airbnb has no public content API
> for third parties, so v1 is (a) paste-your-listing-URL import of the
> owner's OWN listing (owner-consented fetch of public listing data: title,
> photos, house rules, amenities, address entered/confirmed by owner) +
> (b) iCal calendar sync (Airbnb officially exports this) so guest links
> can auto-scope to stay dates, + (c) a structured import wizard that turns
> amenities/house-rules text into draft guides via the existing AI
> structuring path (owner reviews before anything saves — same rule as
> voice-to-guide). Architect it as a provider interface (airbnb, vrbo,
> direct) so deeper partnerships slot in without rework — that interface IS
> the acquisition story. Update the Ledger.

### Prompt 17 — Host pricing & metered entitlements (run before Prompt 15)
> Read docs/platform/. Design host pricing on the EXISTING entitlement
> system (plans → plan_entitlements feature_key/int/unlimited — already
> enforced by RLS + EntitlementService): meter on **properties**, **team
> seats**, **guides**, and **Alfred questions/month**, with the same
> read-only-over-limit downgrade philosophy the family product uses (never
> delete, never brick — content becomes read-only past the cap). Propose
> 2–3 host tiers with the metering math, wire host products into the
> existing Stripe (web) + RevenueCat (native) rails and the same
> user_billing reconciliation, and define org-level billing (an org with
> many workspaces pays once). Deliverable: PRICING.md + entitlement rows +
> enforcement test list. Update the Ledger.

### Prompt 18 — The Alfred owner loop (run after Prompts 7 + 16)
> Read docs/platform/. Build the owner side of Alfred: a digest of
> unanswered guest questions per property (from Prompt 7's capture), each
> with one-tap "answer it" → prefilled guide/section via the existing AI
> structuring + gap-filler starter pattern; coverage score per property
> (gap-filler logic on the host taxonomy); and the freshness loop pointed
> at host content (season-stale: "pool guide, last touched in winter").
> This is the retention engine for hosts — quiet, in-app, opt-out
> respected, same rules as the family nudges. Update the Ledger.

---

## Sequencing rules (why this order holds)

1. **Ledger before anything** — the "save assumptions" mechanic is Prompt 0,
   not a habit you hope for.
2. **Tenancy before any host feature** (P1–P3) — retrofitting workspaces
   under a live second product is how platforms die.
3. **Generalize the engine before building on it** (P4 before P9) — the host
   guide builder must be the family builder with different taxonomy, not a
   fork.
4. **AI Q&A (P7) sits in the middle deliberately** — it delights existing
   B2C users first (validation on friendly territory) and becomes the guest
   VA for free in P9.
5. **Nothing user-visible changes without a flag** — every prompt above
   ships dark and flips per-audience, the same pattern already used for
   family sharing, IAP, and Host Mode.
6. **Every prompt ends with the Ledger update** — that is what makes
   prompt N+1 cheaper than prompt N, and what makes the repo legible to a
   diligence team.
