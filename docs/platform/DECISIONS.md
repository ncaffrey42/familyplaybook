# Architecture Decision Log

Append-only. Never edit or delete a past entry — if a decision is
superseded, add a new entry that says so and link back to it. Every
architecture prompt in [`PLATFORM_PROMPTS.md`](../../PLATFORM_PROMPTS.md)
reads this file first and appends to it before finishing.

Entry format:

```
## YYYY-MM-DD — <decision, one line>

**Why:** the forces that made this the answer.
**Alternatives rejected:** what else was considered and why it lost.
**Evidence:** files/migrations that show the decision in the code.
```

Dates below are first-commit dates for the file that introduced the
pattern (`git log --diff-filter=A`), not calendar guesses.

---

## 2026-03-05 — Supabase Postgres RLS is the security boundary, not app code

**Why:** Every table holding user content (`guides`, `packs`, `shared_links`,
`family_invitations`, `user_billing`, …) is reachable from multiple entry
points — the web client, the Capacitor native shells, and Deno edge
functions — all using the same Supabase anon/service keys. Row Level
Security enforces "who can see/touch this row" once, in the data layer,
so a new client or a new route can't accidentally skip a check that only
existed in application code. All 26 public tables in `supabase/schema.sql`
have `ENABLE ROW LEVEL SECURITY`; policies key off `auth.uid()`.
**Alternatives rejected:** App-layer authorization checks re-implemented in
every route/edge function — rejected because it means every new code path
has to remember to re-verify ownership, and one miss is a data leak.
A standalone authorization service — rejected as premature complexity;
Postgres already has `auth.uid()` and RLS natively, and the team is small
enough that a second service is pure overhead.
**Evidence:** `supabase/schema.sql` (every `CREATE TABLE` is followed by
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`; 53 `CREATE POLICY` statements).

---

## 2026-07-09 — Share links resolve only through a `SECURITY DEFINER` RPC

**Why:** Public share pages (`PublicSharePage.jsx`, "Helper mode") are
intentionally unauthenticated — a parent shares a link, a grandparent opens
it with no login. RLS can't safely grant an anonymous visitor "see exactly
this one guide/bundle, and only if it isn't expired and is still marked
shareable" without opening the underlying `guides`/`packs` tables to the
`anon` role in general. `get_shared_content(p_share_id)` runs as
`SECURITY DEFINER`, does the expiry + `is_shareable` checks server-side,
and returns only the shaped JSON the public page needs — never a row the
client could query directly.
**Alternatives rejected:** `anon`-role `SELECT` RLS policies scoped by
`shared_links` — rejected because it requires granting the `anon` role
direct table access, and a policy bug then exposes the whole table instead
of one response shape. Client-side expiry/visibility checks against the
anon key — rejected because "a closed link is a feature, not an error" (the
RPC's own comment) has to hold even against a modified client; trusting the
browser to enforce expiry defeats the point of expiring links.
**Evidence:** `supabase/schema.sql` `get_shared_content()` (STABLE
SECURITY DEFINER); `supabase/migrations/20240109_share_link_hardening.sql`;
`src/pages/share/PublicSharePage.jsx`.

---

## 2026-07-09 — Feature flags are build-time `VITE_*` env vars, not a runtime flag service

**Why:** Every optional surface — family sharing, AI generation, Host Mode,
feedback, the freshness/gap-nudge re-engagement trio — needs to ship dark
and flip per build/audience without adding a new service. `VITE_*` is
already the existing convention for config (`VITE_SUPABASE_URL`,
`VITE_STRIPE_PUBLISHABLE_KEY`, …), so flags reuse Vite's `import.meta.env`
rather than inventing a second mechanism. This is also what let Host Mode
ship in the bundle as a non-functional mockup, hidden from App Store
review, until it's real (`VITE_ENABLE_HOST_MODE`, default off).
**Alternatives rejected:** A runtime flags table/service (e.g. a
`feature_flags` table read at app boot) — rejected as unneeded at current
team/scale, and build-time flags are sufficient to gate App Store review
risk on a per-release basis. Per-environment code branches — rejected
because the same built bundle must serve family users with a flag off and
internal testers with it on from one artifact.
**Evidence:** `src/lib/featureFlags.js` (`FAMILY_SHARING_ENABLED`,
`AI_GENERATION_ENABLED`, `HOST_MODE_ENABLED`, `FEEDBACK_ENABLED`,
`SHARE_EXPIRY_ENABLED`, `FRESHNESS_ENABLED`, `GAP_NUDGE_ENABLED`).

---

## 2026-07-09 — Migrations are the history; `supabase/schema.sql` is the generated source of truth for current state

**Why:** Numbered migrations (`supabase/migrations/2024*.sql`) are how
schema change is reviewed and applied in order, but replaying dozens of
migrations to answer "what does the schema look like right now" doesn't
scale for review or for bootstrapping a new environment. `schema.sql` is
generated from the live database via the Supabase Management API
(`scripts/generate-schema-snapshot.py` — tables, constraints, indexes,
functions, triggers, RLS policies) and committed as a reviewable, diffable
snapshot. A new environment applies `schema.sql` once, then marks the
migrations it already encodes as applied, instead of replaying history.
**Alternatives rejected:** Migrations-only, no snapshot — rejected because
"what's the schema today" then requires either a live DB connection or
mentally replaying every migration in order, which doesn't scale as the
migration count grows. An ORM-managed schema (e.g. Prisma/Drizzle schema
file as source of truth) — rejected because the app has no ORM layer; it
talks to Postgres through the Supabase client and hand-written SQL
migrations, and introducing an ORM here would be an unrelated, larger
change.
**Evidence:** `supabase/schema.sql` (header: "Regenerate with
scripts/generate-schema-snapshot"); `scripts/generate-schema-snapshot.py`.

---

## 2026-07-16 — One shared `user_billing` row reconciles both payment providers

**Why:** Stripe (web checkout) and RevenueCat (native IAP on iOS/Android)
are two independent billing systems, each with its own webhooks and its
own idea of subscription state. The product needs one authoritative answer
per user to "what plan are they on, are they read-only-over-limit" —
`EntitlementService` and every RLS-enforced limit function
(`get_user_numeric_limit`, `is_guide_editable`, `is_pack_editable`) read
one row in `public.user_billing`, keyed by `user_id`, with a
`billing_provider` column recording which rail last wrote it
(`'stripe'` default, or RevenueCat via the IAP reconciliation path).
Stripe-sourced fields are additionally protected from arbitrary client
writes (`prevent_stripe_updates()` trigger) so only the webhook path can
change them.
**Alternatives rejected:** Separate `stripe_subscriptions` and
`revenuecat_subscriptions` tables with entitlement logic reading both —
rejected because it doubles the surface every entitlement check has to
consider, and makes the read-only-over-limit downgrade logic ambiguous for
a user with rows in both (which one wins?). Trusting each provider's
client SDK for entitlement state directly on-device — rejected because it
breaks the "server is the only writer of billing truth" posture already
established for Stripe (see `prevent_stripe_updates()`), and native IAP
receipts are exactly the kind of client-reported state that needs
server-side verification via webhook, not client trust.
**Evidence:** `supabase/schema.sql` `public.user_billing` (`billing_provider
text DEFAULT 'stripe' NOT NULL`); `supabase/migrations/20240113_iap_revenuecat.sql`;
`supabase/migrations/20240106_scheduled_downgrade_columns.sql`;
`supabase/migrations/20240107_webhook_idempotency.sql`;
`src/services/EntitlementService.js`.

---

## 2026-08-11 — Tenancy layer added additively; `workspace_id` is a `text`+`CHECK` discriminator, not per-vertical tables

**Why:** The platform needs an org/workspace/role layer above the
single-user ownership model without breaking the live B2C app mid-flight.
Three design choices make that possible: (1) `organizations` →
`workspaces` (1:many) → `workspace_members` (user × workspace × role) are
new tables, and `guides`/`packs`/`shared_links`/`share_grants` gain a
nullable, backfilled `workspace_id` rather than being restructured — every
existing user's content ends up in exactly one personal `family`
workspace they exclusively own, which is a bijection with today's
`user_id`-based ownership, so every existing RLS policy and edge-function
`.eq('user_id', …)` filter remains correct unmodified. (2)
`workspace_type` is `text` + `CHECK (... IN ('family', 'host'))`, matching
the schema's existing convention for closed vocabularies (`plan_key`,
`billing_provider`, `role`, `status`, `kind` are all `text`+`CHECK`, never
a native `ENUM`) — so a new vertical (real-estate, schools, elder-care) is
one `CHECK` constraint edit, not a schema restructure. (3)
`family_invitations` keeps being the invitation *workflow* (pending
token, decline history); a new `AFTER UPDATE OF status` trigger projects
accepted/declined/removed rows into `workspace_members`, rather than
migrating the invite flow itself — one write path, two read shapes during
the transition.
**Alternatives rejected:** A native Postgres `ENUM` for `workspace_type` —
rejected because adding a value to a Postgres `ENUM` inside a transaction
has historically required care (and pre-12 required avoiding the same
transaction as its use), while a `CHECK` constraint edit is a trivial,
uniformly-safe additive migration — and it breaks consistency with every
other closed-vocabulary column in this schema. A `host_workspaces` /
`family_workspaces` table-per-vertical design — rejected because it turns
"add a vertical" into a schema migration and a full parallel set of
RLS/query code per vertical, defeating the stated goal. Rewriting
`family_invitations` directly into `workspace_members` (dropping the
former) — rejected because `family_invitations` carries invitation-workflow
state (pending token, invited-but-not-yet-a-user email, decline/removed
history) that `workspace_members` (settled membership only) has no shape
for, and the existing `send-family-invite`/`accept-family-invite` edge
functions and UI would need to change in this same migration — a project
this design deliberately keeps schema-only and code-free (see
`ARCHITECTURE.md` §6). Rewriting existing RLS policies and edge-function
`user_id` filters to `workspace_id` in this same migration — rejected as
unnecessary risk for zero behavior change: the bijection in
`ARCHITECTURE.md` §3.1 means the old policies stay correct, so the rewrite
is deferred to Prompt 3 (RBAC unification), which needs to do it anyway
to introduce real capability-based roles.
**Evidence:** `docs/platform/ARCHITECTURE.md` (full design + migration
plan); no schema or application changes shipped with this entry — design
only, per the prompt that produced it.

---

## 2026-08-11 — Workspace resolution/switching is additive UI state; starting-vertical intent is capture-and-apply, never a silent OAuth side effect

**Why:** Two auth-adjacent deltas needed specifying without touching any
of the seven existing sign-in paths (password, magic link, four OAuth
providers, native deep-link). (1) Post-login workspace resolution
("last-active, else personal") needs somewhere to persist "which
workspace was I last in" — a new nullable `profiles.last_active_workspace_id`
column, mirroring how `profiles` already carries other per-user app state
(`full_name`, `avatar_url`). Resolution and the workspace switcher UI it
feeds are scoped to *only* compute/display/persist the active workspace
in this design — they don't yet change what `DataContext` loads (still
deferred to Prompt 3/4, per `ARCHITECTURE.md` §6's precedent), so this
stays additive. (2) The switcher needs no feature flag: it renders only
when a user has more than one `workspace_members` row, and Prompt 1's
backfill bijection guarantees every account has exactly one until a
workspace-creating flow (earliest: Prompt 8) ships — the visibility
condition is self-gating by data, the same end result a flag would give,
without needing one. (3) Registration's starting-vertical choice
(`?vertical=host` entry point) threads through `raw_user_meta_data` for
password/magic-link signup (an existing precedent — OTP already passes
custom `options.data`), but OAuth's `signInWithOAuth` has no equivalent
caller-metadata hook, so OAuth signups capture intent client-side
(`sessionStorage`) and apply it post-callback *only* after confirming the
session is a fresh signup, never on a returning user's OAuth login — an
explicit safety rule to prevent a stale intent flag from silently
reassigning an existing account's workspace type.
**Alternatives rejected:** Storing "last active workspace" on
`workspace_members` itself (e.g. a `last_active_at` per membership row) —
rejected because resolution needs one answer per *user*, not per
membership, and deriving "most recent" from timestamps across rows is
more complex than one direct pointer column for no benefit at this scale.
A `VITE_ENABLE_WORKSPACE_SWITCHER`-style flag for the switcher — rejected
as redundant: the `workspaces.length > 1` condition already makes it
unreachable in production today, and a flag would be one more thing to
remember to flip later for zero additional safety. Trusting the
`sessionStorage` starting-vertical intent flag alone to authorize
changing an OAuth user's workspace type — rejected as a tenancy-data
integrity risk; intent from client storage can inform, never authorize,
a change to server-side tenancy state.
**Evidence:** `docs/platform/AUTH_FLOWS.md` (full audit, deltas, sequence
diagrams, test matrix); no schema or application changes shipped with
this entry — design only.

---

## 2026-08-11 — Permissions are rows, not code: `(workspace_type, role) → capability` tables behind one `has_capability()` helper; guest is never an RLS subject

**Why:** Both verticals need roles (family: owner/adult/helper; host:
owner/manager/cleaner/guest) without forking policy code per vertical.
Four choices make that work. (1) The matrix lives in
`workspace_role_capabilities (workspace_type, role, capability)` rows,
FK'd to a `workspace_roles` role-set table and a `capabilities` catalog,
so adding a vertical — or changing what a role may do — is an `INSERT`,
not a migration and not a code branch. Those tables get RLS with `SELECT`
for `authenticated` and **no write policy at all**, because write access
to the matrix is equivalent to granting yourself every capability. (2)
One `has_capability(workspace_id, capability)` `SECURITY DEFINER` helper
(`STABLE`, `SET search_path TO 'public'`, fail-closed on NULL workspace,
NULL `auth.uid()`, or unknown capability) replaces per-table role checks,
matching the conventions the existing `is_accepted_family_member()` /
`viewer_can_see_*()` helpers already established. (3) `share_grants`
composes with capabilities on a different axis rather than being
rewritten: capabilities are workspace-wide and coarse, grants are
per-row and narrowing, so a `content.view.granted` role's SELECT policy
is `has_capability(...) AND viewer_can_see_guide(id)` with that existing
function called verbatim. This makes family:Helper and host:Cleaner the
same capability row, which is exactly what Prompt 10 needs ("cleaners get
task-relevant guides only, grants model reused") — the payoff of not
forking. (4) **Guest is never a `workspace_members` row, never a role
value, never granted an RLS policy** — it exists in the matrix as
documentation of what `get_shared_content()` exposes. The schema today has
zero `TO anon` policies, so "guest must never enumerate" is already
structurally true; the only way to keep it true is to never introduce an
anon-role policy.
**Alternatives rejected:** Encoding the matrix as a CASE/IF ladder in SQL
or TypeScript — rejected as the literal "code fork" the design is meant
to avoid; a new vertical would touch every policy. A native `ENUM` or
per-vertical role tables — rejected for the same reasons `workspace_type`
rejected them (`ARCHITECTURE.md`). Folding the read-only-over-limit
`AS RESTRICTIVE` policies into the capability model — rejected because
plan-tier limits and identity are orthogonal axes: unifying them would
make a billing bug present as a permissions bug, and put `user_billing`
in the path of every permission check. Modeling guest as a real role with
an anon RLS policy — rejected as the single highest-risk change available
here; it would trade a structurally-guaranteed property for one enforced
by policy predicates. Granting family:editor (Adult) `content.create` —
rejected *for now* purely to preserve parity: today's
`WITH CHECK (auth.uid() = user_id)` INSERT policy means an editor cannot
create content in the owner's collection, so granting it would be a
day-one behavior change; because the matrix is data, granting it later is
one row. **Proving parity after adding the new policies** — rejected as
too late to be a gate: permissive RLS policies OR together, so the moment
a new policy exists, effective access is `old ∪ new` and a too-broad new
predicate is already a live escalation. Parity is therefore proven in
shadow *before* any policy is created (migration M3 precedes M4).
**Evidence:** `docs/platform/RBAC.md` (matrix, RLS pattern, 5-phase
migration plan, 35 adversarial tests); no schema or application changes
shipped with this entry — design only.

---

## 2026-08-11 — Category becomes `content_categories` rows keyed by `workspace_type`; "playbook" is defined as the `workspace_id` equivalence class, not a table

**Why:** Generalizing the content engine to hosts needs the guide/bundle
taxonomy to vary per vertical without forking the engine. (1) `category`
moves into a `content_categories (workspace_type, key, label, prompt_hint,
color_token, sort_order, is_default)` table — same shape and same
read-only/no-write-policy RLS posture as `RBAC.md`'s capability tables, so
a new vertical is an `INSERT`. `key` stores the literal display string
(`'How To'`, not `'how_to'`) because that is what `guides.category` holds
today and what `get_shared_content()` returns to the public share page;
slugging would mean rewriting live rows, the AI enum, the filter chips and
the share payload for no user-visible gain — the same "stored values stay,
labels are data" call `RBAC.md` §2.1 made for role names. (2) `prompt_hint`
makes the one hand-written sentence in `voice-to-guide`'s system prompt
data too, so the AI path's category guidance generalizes with the taxonomy
rather than beside it. (3) **"Playbook" is formalized without a table**:
it is exactly the set of `guides`/`packs` rows sharing one `workspace_id`.
One workspace ⟺ one playbook, so a `playbooks` table would add an entity
with no information in it. Prompt 9's per-property playbook is then a
sub-tree (a bundle) of the workspace's playbook, not a competing root.
(4) No FK or `CHECK` ties `guides.category` to the new table yet:
the column is unconstrained `text` today, the live database is unreachable
to enumerate existing values, and the correct rule ("valid *for this
row's workspace's vertical*") isn't expressible as a simple FK anyway —
so a validation *report* ships first and constraints are deferred, the
same verify-then-constrain discipline as `20240104_retire_archive.sql`.
**Alternatives rejected:** A `CHECK` constraint listing all verticals'
categories on `guides.category` — rejected because it makes every new
vertical a migration on the largest table, and can hard-fail on unknown
legacy values. Per-vertical content tables (`host_guides`) — rejected for
the same reason `ARCHITECTURE.md` rejected per-vertical workspace tables.
A `playbooks` table — rejected as an entity carrying no data that
`workspace_id` doesn't already carry; it would need a 1:1 constraint with
`workspaces` and a join on every content query to express nothing.
Slugged category keys — rejected (see above). Enforcing that a host
workspace can't hold a `How To` guide — deferred: `category` drives a
colored dot and a filter chip, `GuideIcon` already falls back safely on
unknown values, so an invalid category is a cosmetic defect and not worth
a constraint that can block writes.
**Evidence:** `docs/platform/CONTENT_ENGINE.md` §3–4; `guides.category` is
`text` with no constraint (`supabase/schema.sql:86`); the taxonomy is
currently duplicated across six literals in
`voice-to-guide/index.ts:15,99,124`, `CreateGuideScreen.jsx:265-267`,
`GuidesLibrary.jsx:19`, `GuideIcon.jsx:17-22` — which have already drifted
(`GuideIcon` styles an `Emergency` category nothing else knows about). No
schema or application changes shipped with this entry — design only.

---

## 2026-08-11 — Public storage buckets are recorded debt with a phased path to private buckets + signed URLs; not blocking the host build

**Why:** Media (`images`, `guide-videos` buckets) is uploaded and read via
`getPublicUrl()`, so every object is world-readable by URL forever. This
is not an abstract concern — it defeats two features the product already
ships: **share-link expiry** (`get_shared_content()` correctly returns
`{type:'expired'}`, but every media URL that link rendered still resolves)
and **un-sharing** (`is_shareable=false` returns `{type:'private'}`, same
gap). The guide text closes; the photos of the keys and the alarm panel do
not. It is recorded rather than fixed now because the fix is genuinely
non-trivial and the prompt that surfaced it explicitly said not to block
on it: **signed URLs cannot be minted inside Postgres**, so the anonymous
share path — today a self-contained `SECURITY DEFINER` RPC — necessarily
grows a new edge function that re-validates share id/expiry/`is_shareable`
before issuing short-TTL signed URLs. The phased path (P1 write new
uploads to a private bucket as *paths* with dual-read on `http`-prefixed
legacy values → P2 signing endpoints → P3 backfill + rewrite the `steps`
jsonb → P4 flip old buckets private → P5 GC orphaned `temp-*` uploads)
keeps every phase non-breaking except P4, which is gated on P3 being
verified complete.
**Alternatives rejected:** Flipping the buckets private now — rejected as
an immediate outage for every existing guide's media, with no read path in
place. Keeping media public permanently and documenting it as intended —
rejected because expiring share links are a paid, promoted feature whose
guarantee is materially weaker than users would assume. Storing signed
URLs in the `steps` jsonb — rejected: signed URLs expire, so persisting
them just converts a permanent leak into permanently broken images.
Blocking the host vertical on this remediation — rejected per the prompt,
and because host media has the same exposure as family media today, so
shipping hosts does not worsen the existing posture.
**Evidence:** `docs/platform/CONTENT_ENGINE.md` §5;
`src/components/MediaUpload.jsx:125,140`, `src/components/ImageUpload.jsx:62,68`;
`supabase/migrations/20240109_share_link_hardening.sql`. Related diligence
gap: `scripts/generate-schema-snapshot.py:29-30` snapshots only
`schemaname='public'`, so **no `storage` schema policy appears in
`supabase/schema.sql` at all** — the repo's own source-of-truth snapshot
cannot answer what protects `storage.objects`. No schema or application
changes shipped with this entry — design only.

---

## 2026-08-11 — The 3-tab nav is a fixed contract; the workspace switcher mounts on the Home header's workspace name, and Home cards follow one exclusive-nudge chain

**Why:** Three separate nav questions, one constraint — no 4th tab, because
three tabs is a shipped, deliberate IA and a fourth is the fastest way to
make the family app feel like platform scaffolding leaked into it. (1)
**"My Family" is already 80% surfaced in the Share tab** — the member
avatar row, roles/pending state, and the entire per-person `share_grants`
picker live in `ShareCenterScreen.jsx:171-268`. What is missing is only a
*labelled* door: both existing paths to member management are incidental
(a "+" avatar, and a "Remove …" link that only appears after selecting a
member). So the fix is one text button in the section header — reusing the
exact right-aligned-raspberry-button grammar Home already uses for
"All {n}" — not relocating `ManageFamilyScreen`, which would drag its
route, deep links, invite-accept `returnTo`, and Settings entry with it.
(2) **The workspace switcher mounts on the Home header's `<h1>`**, which
*already renders the workspace's name* (`HomeScreen.jsx:88-90`) — so for a
multi-workspace user it costs zero new chrome, and for everyone else it
stays the static heading it is today. This refines `AUTH_FLOWS.md` §3's
`AccountLayout` placement into two complementary mounts sharing one
component: Home header = *switch* (fast, every session), Account header =
*manage* (occasional). The precedent is already in the codebase — Account
itself is reached from the Home header avatar, not a tab. (3) **Home card
priority is documented, not changed**: share card (always) → `HomeNudge`
(at most one of gap → freshness) → guides → usage nudge. Completeness beats
decay, and the code enforces it in the memo (`HomeNudge.jsx:49` returns
`null` when a gap exists) rather than relying on render order; the
freshness cadence stamp fires only when the card *actually renders*, so
losing to a gap card doesn't burn the fortnight's budget.
**Alternatives rejected:** A 4th "Family" or "Workspaces" tab — rejected
per the constraint above. Moving `ManageFamilyScreen` into the Share tab —
rejected as a large regression surface (invite-accept `returnTo`, deep
links, Settings entry) for a discoverability problem solved by one button.
Putting the switcher in `BottomNav` — rejected because a switcher is not a
destination; it changes the lens on every destination. **Building the
switcher now** — rejected: it reads `workspaces`/`workspace_members`, which
do not exist, and its own visibility rule (`length > 1`) would render
`null` for 100% of users indefinitely. That is dead code with no data
source, not a feature shipping dark, so the prompt's second permitted UI
change was deliberately left unused. Changing the usage nudge to suppress
when a gap/freshness card shows — rejected as a revenue-adjacent product
decision, not a nav cleanup (recorded as an open question instead).
**Evidence:** `docs/platform/NAV.md`. **One** UI change shipped:
`SHARE_TAB_MANAGE_ENABLED` (`VITE_ENABLE_SHARE_TAB_MANAGE`, default off,
double-gated inside `FAMILY_SHARING_ENABLED`) adding a "Manage" button to
the Share tab's Family & helpers header — flag-off renders the original
line verbatim.

---

## 2026-08-11 — Share access is counted in two columns via an anon-callable `SECURITY DEFINER` RPC, never an events table and never an anon RLS policy; notification channels get one seam and no infrastructure

**Why:** Adding labels, arbitrary expiry and an access log to share links
forced four choices. (1) **The access log is two denormalised counters**
(`opened_count`, `last_opened_at`) on `shared_links`, not a
`share_access_events` table: O(1) to read in a list that already queries
every link, no unbounded growth or retention policy, no new RLS surface —
and, decisively, **privacy by construction**, since per-open rows would let
an owner reconstruct when a specific houseguest was reading. No IP, no
user-agent, no visitor id is stored. The cost is no history, accepted
because the ask was exactly two scalars. (2) **A separate `VOLATILE`
`record_share_access()` RPC** was structurally necessary, not stylistic:
`get_shared_content()` is `STABLE`, and a `STABLE` function cannot write.
It mirrors that function's posture exactly — `SECURITY DEFINER`,
`search_path` pinned, `REVOKE FROM PUBLIC` + `GRANT EXECUTE TO anon` — so
**no `TO anon` RLS policy is added**, preserving the structural
"guest never enumerates" guarantee from `RBAC.md` §1.2. It returns `void`
and behaves identically for real, expired and nonexistent ids, so it can't
probe which links exist. (3) **Counts are deliberately approximate**: a
1-minute debounce collapses refreshes and bounds bot-driven row churn,
expired links don't count (they show the guest nothing), and the call is
client-invoked and therefore skippable — fine for a retention signal, so
it must never become a billing or security input. (4) **Notifications get a
seam, not infrastructure**: `record_share_access` is the single
server-side moment where "someone opened your link" becomes true, so every
future channel attaches there. Channel plan recorded — in-app inbox first
(Prompt 11's `notifications` table), web push deferred (`push_subscriptions`
already exists but nothing delivers), email deferred as a digest, native
push unplanned — inheriting the existing re-engagement rules that surfaces
are in-app only and silence is the default.
**Alternatives rejected:** A `share_access_events` table — see the privacy
and growth argument above; addable later alongside the counters if history
is ever needed. Writing the counter inside `get_shared_content` — impossible
without making it `VOLATILE`, which would forfeit planner caching on the
hottest anonymous read path for an analytics side effect. An `anon`
`UPDATE` RLS policy on `shared_links` — rejected outright: it would trade
a structural guarantee for a policy predicate, exactly what `RBAC.md` §1.2
exists to prevent. Naming the label column `label` — rejected because
`ShareCenterScreen` already derives a client-side `label` for the *content*
name, so the column would be silently discarded by the object spread.
Changing `presetFromExpiry` to exact matching unconditionally — rejected as
a behavior change to shipped UI (stale links would lose their highlighted
selection), so exact matching is opt-in via `{ allowCustom: true }` and the
fuzzy default is preserved and verified. A trigger firing per open —
rejected as infrastructure with no consumer.
**Evidence:** `docs/platform/SHARING.md`;
`supabase/migrations/20240128_share_labels_access_log.sql` (written, **not
applied** — the Supabase project is unreachable); UI behind
`VITE_ENABLE_SHARE_LABELS`, default off, which **must** stay off until that
migration is applied.

---

## 2026-08-11 — `shared_links` never had an UPDATE policy, so link expiry has been silently immutable since it shipped

**Why:** Recorded as a decision because the fix ships here and the failure
mode is worth remembering. `20240109_share_link_hardening.sql` gave
`shared_links` `INSERT`, `SELECT` and `DELETE` policies — its own comment
(*"Owners could create links but never revoke them; allow delete for future
unshare/revocation flows"*) shows `UPDATE` was simply never considered. Two
shipped client paths issue `UPDATE`s anyway: the "For how long" expiry
picker (`ShareScreen.jsx:172`) and re-share expiry refresh
(`GuideDetail.jsx:160`). Under RLS with no permissive `UPDATE` policy,
Postgres matches zero rows, PostgREST returns `204`, and supabase-js
reports `error: null` — so the optimistic UI shows success and the value
reverts on reload. `expires_at` is correct at `INSERT` (always
`computeExpiry('tonight')`) and immutable thereafter, with
`SHARE_EXPIRY_ENABLED` defaulting **on**. Net: choosing "Until I switch it
off" produces a link the owner believes is permanent and that still dies at
midnight. The `UPDATE` policy was independently required for labels — a
label you cannot save is not a feature — so the fix is the same one line.
**The lesson worth keeping: a missing RLS policy for a write is silent, not
loud.** Nothing in the client distinguishes "blocked by RLS" from
"succeeded", because both are a 204. Any future write path to a
`SECURITY`-sensitive table should either call `.select()` so zero rows is
detectable, or be covered by a test that reloads and re-reads.
**Alternatives rejected:** Fixing it in the client (e.g. via an edge
function using the service-role key) — rejected as working around a missing
policy with a privilege escalation. Leaving it for a dedicated bugfix
prompt — rejected because this prompt's own feature cannot work without the
same policy. Adding `.select()` to the two existing call sites in the same
change — deferred: strictly better, but it touches unflagged shipped paths
and this change set cannot run the unit suite (pre-existing Node/vitest
incompatibility), so the new code paths use `.select('id')` and the old
ones are left for a change that can be tested.
**Evidence:** `supabase/schema.sql:1104-1106` (three policies, no UPDATE);
`supabase/migrations/20240109_share_link_hardening.sql:148-155`;
`docs/platform/SHARING.md` §2. Fixed by
`supabase/migrations/20240128_share_labels_access_log.sql` — **which has not
been applied**, so the bug is live until it is.

---

## 2026-08-11 — Correction: the Supabase backend is live, and two entries above say otherwise

**Supersedes** the reachability claims in the two entries above dated
2026-08-11 (the `content_categories` entry — *"the live database is
unreachable"* — and the share labels/access log entry — *"the Supabase
project is unreachable"*). Those entries are left unedited per this file's
append-only rule; **their reachability statements are wrong** and this entry
is the correct one. Every other claim in them stands.

**What is actually true**, verified 2026-08-11: `ifdncylgiqhhcwovpdyf.supabase.co`
resolves, `GET /rest/v1/…` returns `200` with the anon key,
`GET /auth/v1/health` reports GoTrue `v2.195.0`, and
`POST /rest/v1/rpc/get_shared_content` returns `200`. Reachable from a shell
*and* from the browser. The Supabase CLI is authenticated with this project
linked.

**Why:** Two errors compounded. A stored memory note recorded the project as
NXDOMAIN on 2026-07-09 — true then, stale now, since the project has been
restored. Then a single `ERR_CONNECTION_REFUSED` line in the browser console
was attributed to Supabase without checking which URL had failed; the page's
only cross-origin requests were Google Fonts, so it was never Supabase. A
stale note plus an untraced error became a confidently-repeated fact used to
justify skipping verification across two prompts.

**What it changes:** nothing about the designs — no decision above depended
on the backend being down. What it changes is the *verification debt*.
Things previously described as unverifiable are simply unverified:

- `20240128_share_labels_access_log` is unapplied because nobody applied it.
  Confirmed live: `POST /rest/v1/rpc/record_share_access` → `404 PGRST202`
  ("not found in the schema cache"), so the expiry bug it fixes **is still
  live in production**.
- The distinct `guides.category` values gating `CONTENT_ENGINE.md` §3.5's
  constraint decision are a `select distinct` away.
- `RBAC.md` §7's "zero viewer rows in production" is checkable, not assumed.

**How to apply:** Probe before asserting — `nslookup`, then `curl` the health
endpoint — and trace the actual failing URL before attributing an error to a
service. Treat a memory note about infrastructure state as a lead to verify,
never as a fact to cite. Note also that the committed `supabase/schema.sql`
snapshot is dated 2026-07-30 and generated from the live DB, so schema claims
drawn from it (including `shared_links`' missing `UPDATE` policy) rest on that
snapshot plus migration history; a live `pg_policies` query is the stronger
confirmation and needs a Management API token.

---

## 2026-08-11 — Ask the Playbook and Alfred are one function scoped by share link, gated to paid owners, counts-only; the grounding threshold ships uncalibrated and blocks release

**Why:** Prompt 7 revised `SPEC_ASK_PLAYBOOK.md` (commit `f1e7ff3`, branch
`claude/spec-ask-playbook`) for the platform and resolved its four open
decisions. (1) **One surface, two products.** A babysitter asking "can Ella
have peanuts?" and a guest asking "what's the wifi?" are the same question
shape against the same machinery, so Alfred is not a second system — it is
`ask-playbook` reached from a host workspace's guest link, which is already
a bundle share. The only vertical-dependent thing is the refusal/label copy,
which comes from workspace data exactly like `content_categories` and
`workspace_roles.label`. Prompt 9 therefore gets the guest VA with no new
endpoint. (2) **Scope is one share link, resolved server-side, never a
caller-supplied guide list.** `resolve_ask_scope(share_id)` re-applies
`get_shared_content`'s exact checks — exists, not expired, still shareable —
because an expired link that still answers questions would silently defeat
the link-expiry feature the product sells. It additionally enforces a
single-workspace invariant written as `COALESCE(workspace_id, user_id)`, so
it is correct both before and after `ARCHITECTURE.md` migration #4 backfills
`workspace_id` rather than needing a retrofit. `match_playbook_chunks`
re-resolves scope from the share id itself, so even a compromised edge
function cannot widen retrieval. **No `TO anon` RLS policy is added** —
`RBAC.md` §1.2's rule, and this feature is its sharpest test, because a
retrieval system scoped wrong *is* an enumeration primitive. (3) **Two
independent grounding gates**, because either alone is insufficient:
retrieval-side (nothing near enough → refuse without an LLM call, saving
cost and preventing drift) and generation-side (an answer citing no in-scope
guide is a hallucinated source and is downgraded to a refusal). (4) **The
four decisions:** share-page surface now (Host Mode is still a mockup);
paid owners' links only; 20 questions/hour/share link; counts-only
analytics.
**Alternatives rejected:** Building a real Host Mode first — rejected as a
dependency on unbuilt tenancy when the share page already works. Per-IP rate
limiting — rejected in favour of per-share-link, because the link is both
the unit of sharing and the only thing an owner can revoke. An event row per
question — rejected for the same privacy reason as `SHARING.md` §5.1's
access log; hour-bucketed counters give the rate check and Prompt 18's
refusal signal while storing not one question. Storing question text for an
owner-facing "what did guests ask" view — rejected as a default: a
babysitter's questions are health data about a child, so owner visibility
would need its own consent design. Free-for-all availability — rejected,
though the growth cost is real and acknowledged: the guest experience is the
viral surface, and gating it means most guests never see it. It is a
plan-entitlement row, so revisiting it is data, not code. Trusting the model
to self-report `grounded` — rejected; citations are validated against the
resolved scope server-side.
**Evidence:** `docs/platform/ASK_PLAYBOOK.md`;
`supabase/migrations/20240129_ask_playbook.sql`;
`supabase/functions/_shared/askPlaybook.ts` + `ask-playbook/` + `embed-guides/`;
`src/components/AskPlaybook.jsx`; `evals/ask-playbook/`.
**Release blocker, recorded deliberately:** `SIMILARITY_THRESHOLD = 0.35` is
**a guess**. It is the single number deciding whether a stressed babysitter
gets an answer or a refusal, and the original spec's own warning was to
budget for the eval loop because "that is where a trustworthy answer (vs a
plausible wrong one) is won". The eval set and runner are written; the loop
has **never been run**, because nothing is deployed and no migration is
applied. Additionally the unit tests have never executed — `vitest` cannot
start in this environment (pre-existing: Node v16.17 vs. rolldown requiring
`node:util`'s `styleText`, needs ≥20.12). **`VITE_ENABLE_ASK_PLAYBOOK` must
not be enabled for any user until the eval set has been run and the
threshold set from that data.**

---

## 2026-08-11 — The Host product is a route namespace with its own chrome, not a second app; guest links are not a tab; KPIs come only from tables that already exist

**Why:** Prompt 8 adds `/host` as a second app shell on the same codebase,
build, Supabase project and design system. Four choices. (1) **Shell, not
application.** `/host` gets its own `HostBottomNav` and KPI header, and the
family `BottomNav` is suppressed under it — everything below the chrome
(auth, `DataContext`, content engine, share links, billing, RLS) is shared.
Prompt 12's two-binary question stays open precisely because the split line
is already the shell. (2) **Nav = Properties / Guides / Team, and guest
links are deliberately NOT a tab.** The family app makes Share a tab because
there is one household and the link is global; for a host a link is
meaningless without its property ("send the *Ivy Cottage* link, dated
Fri–Sun"), so a global Share tab would force re-selecting context the app
already had. Links live inside a property, and the aggregate ("4 live guest
links") surfaces in the KPI header for the "is everything running?" glance.
Same discipline that collapsed Favorites into a chip in `NAV.md` §1: a
destination that always needs an argument is not a destination. The KPI
dashboard is likewise a **header, not a fourth tab** — `NAV.md`'s no-4th-tab
constraint applies to both shells. (3) **KPIs derive from existing tables
only**, no counters and no events: active properties from `packs` (a
property *is* a bundle, per Prompt 9's convention), live guest links from
`shared_links`, and answered-this-week from `ask_playbook_usage` as
`question_count − refusal_count` — the subtraction matters, because a raw
question count would make a link where Alfred refused twenty times look
identical to one where it answered twenty. Each KPI resolves independently
and degrades to "—", so the unapplied `20240129` migration costs one dash
rather than a broken header. (4) **Accent is `apricot`, not a new colour.**
It is already in the palette, already pairs with `mulberry`/`cream`, and —
unlike `coral`, the other candidate — carries no semantic load; `coral`
means *destructive* here (the Share tab's "Remove {name}…"), so promoting it
to a product's primary accent would poison that meaning.
**Alternatives rejected:** A separate app/entry point or a second build —
rejected as premature; nothing yet justifies splitting, and Prompt 12 owns
the trigger condition. A `Today`/dashboard tab — rejected: the KPIs are a
glance, not a place. A global host Share tab mirroring family — rejected per
(2). Making `BottomNav` shell-aware instead of giving the host its own —
rejected because "second app shell" should mean the shell owns its chrome;
one component branching on route prefix would put both products' nav
decisions in one file. Inventing a new host brand colour — rejected; the
instruction was one design system, and the palette already had the right
token.
**Evidence:** `docs/platform/HOST_SHELL.md`; `src/pages/host/`,
`src/components/HostBottomNav.jsx`, `src/hooks/useHostWorkspace.js`,
`src/App.jsx`; flag `VITE_ENABLE_HOST_PRODUCT`, default off.
**Release blocker, recorded deliberately:** **workspace-type gating is a
stub.** Three gating layers were designed (build flag → `workspace_type =
'host'` → capability) and only the flag is enforceable, because
`workspaces`/`workspace_members` do not exist — `ARCHITECTURE.md` and
`RBAC.md` are designed and unapplied. So with the flag ON, *every* account
is host-eligible. That is acceptable for a dark shell and is a serious bug
if shipped. All of it funnels through `useHostWorkspace()` so the real query
lands in one file and no component changes. **Do not enable
`VITE_ENABLE_HOST_PRODUCT` until that hook reads `workspace_type` for
real.** Also unresolved: nothing creates a host workspace yet (Prompt 9 and
`AUTH_FLOWS.md` §5's `?vertical=host` are the two paths), and
`HostMode.jsx`/`VITE_ENABLE_HOST_MODE` — the older non-functional mockup
whose QR points at a 404 — still exists and should be retired once `/host`
is real, leaving two host flags in the meantime.

---

## 2026-08-11 — A property is a row plus a bundle-per-property convention enforced by UNIQUE; the host taxonomy finally migrates; the starter kit is library rows, not code

**Why:** Prompt 9 builds properties on three reuse decisions. (1) **The
per-property playbook is not a new content type.** `properties` is a thin
veneer — name, address, photo — over `bundle_id uuid NOT NULL UNIQUE
REFERENCES packs`, so the schema, not prose, enforces one-bundle-per-
property, and everything already built for bundles (guides, ordering, share
links, expiry, QR, Ask the Playbook) works on properties with zero new
code. `ON DELETE RESTRICT` points from property → bundle so content
outlives the veneer: deleting a property keeps its guides; deleting a
bundle that is some property's playbook is refused until the property goes
first. `workspace_id` is born present-and-nullable so ARCHITECTURE.md
migration #4 has one less table to retrofit. (2) **`content_categories`
ships now** — Prompt 4 designed it, design-only; the guest-guide builder is
its first real consumer, so the migration lands here, byte-for-byte as
CONTENT_ENGINE.md §3.2 specified (family four incl. Emergency, host
Arrival/House/Local/Departure; read-only, no write policy). The client
reads a mirrored constant (`hostTaxonomy.js`) instead of querying on the
editor's hot path; the E2E's step 0 asserts the two stay in sync. (3) **The
starter kit is ten `library_guides` rows** under one `library_packs` row
(`pack_host_starter`), flowing through the exact `handleAddBundleFromLibrary`
copy-to-mine path families already use — fill-in-the-blank templates
(⟨network name⟩) rather than prose, so a new owner reaches a complete
playbook by editing, not composing. Check-in/check-out dated links are
Prompt 6's `expiryFromDateInput` relabelled — the link expires at the end
of the checkout day, and check-in feeds only the label.
**Alternatives rejected:** A `property_guides` join or per-property content
tables — rejected as a parallel content engine; the whole point of the
bundle convention is that Prompts 4–7's work applies unmodified. `CASCADE`
from bundle→property deletion — rejected; a mis-tap deleting a bundle
should never silently take the property record with it, and RESTRICT makes
the dependency visible. Hardcoding the starter kit in client code —
rejected; library rows survive app releases, are editable without deploys,
and the copy-to-mine flow already handles entitlement checks and
`template_id` provenance. Querying `content_categories` from the editor —
rejected for now (hot path, one more failure mode pre-migration); the
mirrored constant is one file to delete later.
**Evidence:** `docs/platform/PROPERTIES.md`;
`supabase/migrations/20240130_properties_host_taxonomy.sql` and
`20240131_host_starter_library.sql`; `src/lib/hostTaxonomy.js`;
`src/pages/host/`; `e2e/host-property-flow.mjs`.
**Known limitation, recorded loudly (PROPERTIES.md §6):** host bundles
appear in the family app's Guides tab — `DataContext` fetches all of a
user's `packs` and nothing scopes by workspace yet. Not fixable here
without touching the one query every family screen depends on; acceptable
while the host flag is dark; **must be resolved by workspace scoping before
`VITE_ENABLE_HOST_PRODUCT` ships** — same release gate as HOST_SHELL.md
§7's gating stub. The E2E is runnable against migrations alone (no edge
functions, no deploy) but **has never run**: it needs migrations
20240128–20240131 applied and a disposable test user; exits with a distinct
code naming the missing prerequisite rather than stack-tracing.

---

## 2026-08-11 — Host teams reuse the invite machinery with two new role values (not value-mapping); analytics v1 is three per-property numbers off existing tables; the "ai ledger" premise is corrected

**Why:** Prompt 10's teams design reduces to two role values because
everything else already exists. The invitation *workflow* —
`family_invitations` token/email-binding/TTL, both invite edge functions,
and the `workspace_members` sync trigger — is reused wholesale; the delta
is widening `family_invitations.role`'s CHECK to admit `'manager'` and
`'cleaner'`, plus a vertical-aware allowed-set in `send-family-invite`.
**Mapping the new roles down to existing values was rejected on capability
grounds:** cleaner ≡ viewer is a true identity (`RBAC.md` §3.1, identical
capability rows), but manager ≢ editor — manager holds
`share.grant.manage`, `member.invite` and `content.create`, which
family:editor lacks, so a value-mapped manager would silently arrive
three capabilities short. Roles are data; the data must carry the real
role. The vertical boundary (no cleaner in a family workspace) is enforced
once, at the membership layer by `RBAC.md` §2.2's validity trigger — never
re-implemented in the invite layer. Cleaners' "task-relevant guides only"
is the `share_grants` + `viewer_can_see_guide()` machinery verbatim, and
its first real user is the dormant grant-picker UI already built in
`ShareCenterScreen` (`RBAC.md` §7) — resurfaced in the host Team tab.
Analytics v1 is three numbers per property, all joined off
`properties.bundle_id`, all behind existing RLS: link opens
(`shared_links.opened_count`/`last_opened_at`, migration `20240128`), VA
asked/refused (`ask_playbook_usage`, migration `20240129`), and coverage
(`hostCoverage.js`, shipped — the gap-filler's deterministic keyword
approach pointed at the host taxonomy, nine topics ≡ the Starter Kit
minus the meta "Just ask" explainer). One deliberate inversion: an empty
property playbook reports 0/9 instead of the family rule's silence,
because a new host is in the opposite moment — coverage IS their to-do
list.
**Corrected premise, recorded:** the prompt sourced VA counts from "the
ai ledger" (`ai_generations`). That table is per-user and `ask-playbook`
deliberately never writes it for guests — anonymity + Prompt 7's
counts-only decision put guest activity in `ask_playbook_usage`, whose
refusal counter exists precisely for this consumption. Premise predates
Prompt 7's resolution; superseded, not wrong.
**Alternatives rejected:** A parallel host-invite system — rejected; one
write path is the whole point of the sync-trigger design. Shipping the
CHECK-widening migration now — rejected as dead schema: the edge function
rejects the values and no UI sends them until the RBAC wave lands, so it
ships with that wave. An AI-scored coverage metric — rejected;
`gapDetection`'s "no AI, no mystery" precedent holds, and a deterministic
regex a host can falsify beats a model's opinion for a to-do list.
Wiring analytics into `HostPropertyDetail` in this prompt — deferred
solely for sequencing: that file is mid-edit by Prompt 9's build, and two
tasks editing one file is how merge damage happens; the library is
shipped and tested, the surface lands on that file's next touch.
**Evidence:** `docs/platform/HOST_TEAMS.md`; `src/lib/hostCoverage.js`;
`src/__tests__/hostCoverage.test.js` (10 cases incl. the self-coverage
invariant — every starter must satisfy its own topic regex, else the
nudge loops forever; runner still blocked on Node v16).

---

## 2026-08-11 — No third-party analytics SDK, as policy

**Why:** Every host-facing number ships from first-party tables the
user's own product actions already write (`shared_links` counters,
`ask_playbook_usage` buckets, client-side coverage) — there is nothing a
PostHog/Amplitude/Firebase SDK would add except: bundle weight on a
mobile-first app, a consent surface, App Store privacy-label
declarations, and a third party holding guest behavior that includes
health-adjacent question patterns ("can Ella have peanuts") —
the exact data `ASK_PLAYBOOK.md` §3's privacy floor exists to keep
un-collected. The App Store privacy posture stays clean because there is
nothing to declare, which is itself a diligence asset: the honest answer
to "what do you collect about guests?" is counts, held by us, and no one
else.
**Alternatives rejected:** "Just add the SDK dark-flagged for later" —
rejected; an SDK in the bundle is a declaration obligation whether or not
it is initialized, and removing one later is harder than never adding it.
Server-side event forwarding to a third party — same objection, minus the
bundle weight.
**Scope:** policy for guest- and host-behavior analytics. It does not
prohibit operational error logging (the existing first-party
`error_logs`) or a future first-party events table if a real need
outgrows the counters (`SHARING.md` §5.1 anticipated exactly that path).

---

## 2026-08-11 — One binary ships both products until a recorded trigger fires; the family bundle id is locked before it becomes immutable; RevenueCat stays one project with per-product entitlements

**Why:** Prompt 12 had to decide, not survey. (1) **Now:** the workspace
switcher decides the shell — post-login resolution (`AUTH_FLOWS.md` §2)
lands a `host`-type workspace at `/host/properties`, else `/home`; the
switcher (both mounts, now including the host KPI header — resolving
`NAV.md` §8's open question) is the cross-shell jump. One conditional in
the resolution landing; no second router; native adds zero gating surface.
(2) **The split path** is ordered so nothing forecloses anything: Phase A
= two Vite entries + two Capacitor configs in this repo (fastlane lanes
parameterized); Phase B — extracting a `packages/core` — happens only if
drift earns it, because a package boundary is a recurring daily cost and
today there is no second team and no drift. (3) **Bundle identity, locked
now while it costs nothing:** the family app keeps
`com.familyplaybook.app` (it has NO public store listing yet —
`VITE_APPSTORE_ID` blank — so this is the last cheap moment to decide; at
first public release the id becomes permanent with ratings and subscribers
attached); host is born `com.familyplaybook.host` at split, keeps its
hands off `familyplaybook://` (OAuth deep-links already bound to it), and
uses universal/app links for guest-facing URLs because a printed QR must
open in the browser for guests without the app. (4) **RevenueCat: one
project, two apps, per-product entitlements** (`family_premium` /
`host_premium`), `app_user_id` = Supabase uid throughout — so the
webhook→`user_billing` reconciliation is untouched by the split.
**The trigger, recorded:** split on the FIRST of — (a) positioning: host
acquisition starts depending on store search that "Family Playbook"'s
listing cannot carry (expected to be the one that fires; a marketing
observation, not an engineering one); (b) scale: host ≥1,000 MAU sustained
60 days or host MRR ≥25% of total; (c) policy: store review friction from
two products in one binary. **Explicit non-triggers:** engineering
preference, cleanliness, redesigns, or the tenancy migrations landing —
one binary is the correct shape until a trigger fires, because the shell
boundary already provides the seam.
**Alternatives rejected:** Splitting now — rejected; §2.4's costs (two
review pipelines, double store metadata/tracks) are recurring, and every
technical prerequisite is already in place, so waiting loses nothing.
A monorepo/core-package extraction as the first step — rejected as paying
a daily boundary cost on zero evidence of drift. Two RevenueCat projects —
rejected; it would fork the identity spine and force the webhook to
reconcile two sources.
**Hazard surfaced while writing this, pre-existing:**
`useNativePurchases.js:89` treats ANY active RC entitlement as premium —
correct while only family entitlements exist, wrong the day a host
entitlement appears (a host-only subscriber would read family-premium on
device). Must be fixed to name its entitlement before any host product is
created in RC.
**Evidence:** `docs/platform/MOBILE_SPLIT.md`; `capacitor.config.ts`;
`fastlane/Fastfile`; `src/lib/revenuecat.js`;
`src/hooks/useNativePurchases.js`. No build — decision document only.

---
