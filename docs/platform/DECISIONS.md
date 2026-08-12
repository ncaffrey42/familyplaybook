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
