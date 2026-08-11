# Platform Architecture: The Tenancy Layer

**Status:** Design only. No migrations have been applied, no application
code has changed. This document is the deliverable of Prompt 1
([`PLATFORM_PROMPTS.md`](../../PLATFORM_PROMPTS.md)). Read
[`docs/platform/DECISIONS.md`](DECISIONS.md),
[`docs/platform/TENANCY.md`](TENANCY.md), and
[`docs/platform/GLOSSARY.md`](GLOSSARY.md) before this file — they record
why today's schema looks the way it does and the terms used below.

---

## 1. What this prompt introduces

Four new concepts, additive to the existing schema:

| Concept | Answers | Cardinality |
|---|---|---|
| `organizations` | Who is the billing + identity boundary? | 1 org owns many workspaces |
| `workspaces` | What content boundary does a "playbook" belong to? | 1 workspace has many members, one `workspace_type` |
| `workspace_members` | Who can act inside this workspace, as what role? | user × workspace × role |
| `workspace_type` | What vertical is this workspace? (`family`, `host`, …) | a column on `workspaces`, not a new table per vertical |

The design goal, restated from `PLATFORM_PROMPTS.md`: a **new vertical**
(real-estate, schools, elder-care) must cost "one new `workspace_type`
value + a role-set defined as data + a new app shell" — never a schema
migration beyond that one value. Nothing below creates a `host_workspaces`
table or a `family_workspaces` table; there is one `workspaces` table for
every vertical, forever.

## 2. Entity design

### 2.1 `organizations`

The billing + identity boundary. Deliberately thin in this prompt — it
exists so `workspaces` has somewhere to hang off, and so Prompt 17 (host
pricing) has an entity to attach org-level billing to later. It does
**not** gain a `user_billing` relationship in this migration; `user_billing`
stays keyed by `user_id` exactly as it is today. See §6 (Out of scope).

```
organizations
  id            uuid primary key default gen_random_uuid()
  name          text not null
  is_personal   boolean not null default false   -- true for the 1:1 backfilled orgs
  created_by    uuid not null references auth.users(id) on delete cascade
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()
```

`is_personal` distinguishes "the org auto-created for one person" from a
future org an owner explicitly creates for a business (relevant to Prompt
2's "how does registration choose a starting vertical" and Prompt 12's
store-split decision — an acquirer reading this table later should be able
to tell backfilled scaffolding from real accounts at a glance).

### 2.2 `workspaces`

The content boundary. `guides`/`packs`/`shared_links`/`share_grants` will
belong to a workspace, not a user (§3).

```
workspaces
  id               uuid primary key default gen_random_uuid()
  organization_id  uuid not null references organizations(id) on delete cascade
  workspace_type   text not null check (workspace_type in ('family', 'host')),
  name             text not null
  created_at       timestamptz not null default now()
  updated_at       timestamptz not null default now()
```

`workspace_type` is `text` + `CHECK`, matching the existing schema's own
convention for closed vocabularies (`plans.plan_key`,
`user_billing.billing_provider`, `family_invitations.role`/`status`,
`feedback.kind` are all `text` + `CHECK`, never a native Postgres `ENUM`).
Adding `real_estate` later is a one-line `CHECK` constraint change — an
additive migration, not a restructure. This is *why* `workspace_type`
satisfies "new vertical is a new type, not a schema change": the schema
doesn't change shape, only the allowed-values list grows.

### 2.3 `workspace_members`

```
workspace_members
  id            uuid primary key default gen_random_uuid()
  workspace_id  uuid not null references workspaces(id) on delete cascade
  user_id       uuid not null references auth.users(id) on delete cascade
  role          text not null check (role in ('owner', 'editor', 'viewer')),
  created_at    timestamptz not null default now()
  unique (workspace_id, user_id)
```

Role vocabulary is deliberately **identical to `family_invitations.role`
today** (`editor`/`viewer`) plus `owner` for the workspace creator. This
is not the final role matrix — Prompt 3 (RBAC unification) formalizes
`owner, adult/editor, helper/viewer` for family and `owner, manager,
cleaner, guest` for host as data-driven capabilities. Prompt 1 only needs
enough role vocabulary to losslessly represent what `family_invitations`
already expresses, so the backfill in §3 is a value-preserving projection,
not a lossy one. `workspace_members` represents **settled membership**
only — it is not an invitation ledger. The invitation *workflow* (pending
token, email, decline) stays in `family_invitations` (§3.3); a trigger
keeps `workspace_members` in sync with it.

### 2.4 ERD

```mermaid
erDiagram
    organizations ||--o{ workspaces : "has many"
    workspaces ||--o{ workspace_members : "has many"
    auth_users ||--o{ workspace_members : "belongs to many"
    workspaces ||--o{ guides : "owns (new workspace_id)"
    workspaces ||--o{ packs : "owns (new workspace_id)"
    workspaces ||--o{ shared_links : "owns (new workspace_id)"
    workspaces ||--o{ share_grants : "owns (new workspace_id)"
    auth_users ||--o{ organizations : "created_by"
    family_invitations ..> workspace_members : "projects into (trigger)"

    organizations {
        uuid id PK
        text name
        bool is_personal
        uuid created_by FK
    }
    workspaces {
        uuid id PK
        uuid organization_id FK
        text workspace_type
        text name
    }
    workspace_members {
        uuid id PK
        uuid workspace_id FK
        uuid user_id FK
        text role
    }
```

## 3. Mapping today's data into the model

### 3.1 The bijection that makes this safe

Today, every `guides`/`packs` row has exactly one owner (`user_id`), and
every user who can act on it is either that owner or an accepted
`family_invitations` member of that owner. After backfill, every existing
user gets **exactly one** personal organization and **exactly one**
`family` workspace, and every row they own gets that workspace's id.
Because the mapping is 1 user → 1 personal org → 1 family workspace, the
new `workspace_id` on a backfilled row and the old `user_id` on that same
row identify the **same set of authorized people** — just through an
extra layer of indirection. This bijection is *why* nothing has to change
behaviorally the moment this migration lands (see §5).

### 3.2 Backfill: personal org + family workspace per user

For every row in `auth.users`:

1. Insert one `organizations` row: `name = COALESCE(raw_user_meta_data->>'name', 'My Family')`, `is_personal = true`, `created_by = auth.users.id`.
2. Insert one `workspaces` row: `organization_id` = the row from (1), `workspace_type = 'family'`, `name = 'Family'`.
3. Insert one `workspace_members` row: that workspace, `user_id = auth.users.id`, `role = 'owner'`.

This also becomes the new-user bootstrap: `handle_new_user()` (today
inserts `profiles` + `user_billing` on `auth.users` insert — see
`supabase/schema.sql:643-668`) gains the same three inserts, so every
signup from this point forward already has a personal org + family
workspace, no backfill needed for new accounts.

### 3.3 `family_invitations` → `workspace_members`, via a sync trigger — not a one-time copy

`family_invitations` (`owner_user_id`, `invited_user_id`, `role`, `status`)
stays exactly as-is — it is the invitation *workflow* (pending token,
invited-but-not-yet-a-user email, decline/removed history) and both
`send-family-invite`/`accept-family-invite` edge functions and the
existing UI keep writing to it unchanged. What changes is additive: a
trigger on `family_invitations` projects **accepted** rows into
`workspace_members` of the owner's personal family workspace, and removes
the corresponding `workspace_members` row when status becomes `declined`
or `removed`.

- Backfill step: for every `family_invitations` row where
  `status = 'accepted'`, insert `(workspace_id = <owner's family
  workspace>, user_id = invited_user_id, role = family_invitations.role)`
  into `workspace_members`.
- Going forward: `AFTER UPDATE OF status ON family_invitations` — on
  transition into `'accepted'`, upsert into `workspace_members`; on
  transition into `'declined'`/`'removed'`, delete the matching
  `workspace_members` row.

This keeps a single write path (the existing invite flow) while giving
every future prompt a normal `workspace_members` table to query, instead
of reaching into `family_invitations` and re-deriving membership every
time (which is what `DataContext.jsx:93-101` does today, by hand, on every
app load — see §5.2).

**`family_members` is not part of this mapping.** It's a second,
structurally similar table (`inviter_id`, `invitee_email`, `status`) that
`recalculate_usage_stats()` reads to compute an `editors` usage count
(`supabase/schema.sql:899-901`), but no client code or edge function ever
queries it (`grep -rn "from('family_members')" src/ supabase/functions/`
→ no matches) — it appears to be a leftover from an earlier design that
`family_invitations` superseded, so the `editors` usage stat it feeds is
almost certainly always zero. This migration does not touch it or migrate
it into `workspace_members`. Flagged here rather than silently carried
forward or silently dropped — cleanup (verify-then-drop, same pattern as
`20240104_retire_archive.sql`) is a candidate for a future prompt, not
this one.

### 3.4 `guides` / `packs` / `shared_links` / `share_grants` gain `workspace_id`

Each of the four tables named in the prompt gets one additive, nullable
column:

```sql
alter table public.guides       add column workspace_id uuid references public.workspaces(id);
alter table public.packs        add column workspace_id uuid references public.workspaces(id);
alter table public.shared_links add column workspace_id uuid references public.workspaces(id);
alter table public.share_grants add column workspace_id uuid references public.workspaces(id);
```

Backfill: `UPDATE <table> SET workspace_id = (SELECT id FROM workspaces
WHERE organization_id = (SELECT id FROM organizations WHERE created_by =
<table>.user_id) LIMIT 1)` (join through the owning user's personal
workspace — `share_grants`/`shared_links` use `owner_user_id`/`user_id`
respectively, both already `NOT NULL` or effectively always populated for
real rows).

**`NOT NULL` is deferred, on purpose** — same pattern as
`20240104_retire_archive.sql`'s treatment of `is_archived`: land the
column, backfill it, verify in production that every row has it populated
and every read path tolerates it, *then* a follow-up migration adds
`NOT NULL`. Doing it in one step risks a locking migration on the two
largest tables in the schema for no benefit — nothing reads `workspace_id`
yet (see §5).

`pack_guides` (the `guides`↔`packs` join table) does **not** get a
`workspace_id` — it has no independent existence outside a `pack` and a
`guide`, both of which now carry the workspace; adding a third copy of
the same fact is redundant and a drift risk (what happens if a
`pack_guides` row's own `workspace_id` disagreed with its `pack_id`'s?).
Same reasoning excludes `user_favorites`, `user_dismissals`,
`ai_generations`, `user_usage` from this migration: these are
**per-user** personalization/ledger data (which guides *I* favorited,
which nudges *I* dismissed), not workspace content, and stay keyed on
`user_id`. This is a deliberate scoping line — see §6.

## 4. New tables' own RLS

`organizations`, `workspaces`, and `workspace_members` are new surfaces
and need policies from day one (nothing reads them yet, but they hold
membership data and must never be openly readable):

- `workspace_members`: a user can `SELECT` rows for any workspace they
  are themselves a member of (`EXISTS (... workspace_members wm2 WHERE
  wm2.workspace_id = workspace_members.workspace_id AND wm2.user_id =
  auth.uid())`) — i.e., members can see their fellow members, not just
  their own row. Only `role = 'owner'` members (or the sync trigger,
  running as `SECURITY DEFINER`) can insert/delete.
- `workspaces`: `SELECT` for members (join through `workspace_members`);
  `UPDATE` (e.g. rename) restricted to `role = 'owner'`.
- `organizations`: `SELECT`/`UPDATE` restricted to `created_by = auth.uid()`
  for now — org-level membership beyond "the personal owner" isn't
  modeled until org-level invites are designed (Prompt 2 explicitly scopes
  this: "org-level invites vs the existing workspace-level invites").

These are genuinely new policies (not a rewrite of existing ones), so they
carry no compatibility risk — nothing depends on their absence today.

## 5. The API boundary rule

> Edge functions and RLS scope by workspace, never by raw user — with a
> compatibility layer so current clients keep working.

This rule has two enforcement points in this codebase, and they work
differently today, which matters for how the rule actually lands:

### 5.1 Client-side queries (RLS-enforced)

`src/contexts/DataContext.jsx` and friends call `supabase.from('guides')…`
directly with the user's session — RLS is the real authorization boundary
here (`DECISIONS.md`'s first entry). **The rule, going forward:** any new
RLS policy written for workspace content must check workspace membership
(a `is_workspace_member(p_workspace_id uuid, p_min_role text default
null)` `SECURITY DEFINER` helper, same shape as today's
`is_accepted_family_member()`), never `auth.uid() = user_id` directly.

**This prompt does not rewrite the ~30 existing content policies** on
`guides`/`packs`/`pack_guides`/`shared_links`/`share_grants`
(`guides_owner_select`, `packs_member_select`, etc. —
`supabase/schema.sql:1052-1106`). Per §3.1's bijection, they remain
*correct* — `auth.uid() = user_id` and "is a member of this row's
`workspace_id`" identify the same people for every row that exists today.
Rewriting them is Prompt 3's job ("one `has_capability(workspace_id,
capability)` helper replacing per-table role checks over time —
additively, old policies stay until parity is proven" — already the plan
in `PLATFORM_PROMPTS.md`). Prompt 1 lands the data (`workspace_id`
populated, correct, indexed) that Prompt 3's policies will need; it
doesn't yet make anything read that data.

### 5.2 Edge functions (service-role, RLS bypassed by design)

This is the part worth stating plainly because it's easy to get wrong by
analogy to RLS: **every edge function in this codebase already bypasses
RLS on purpose.** `_shared/stripe.ts` exports `supabaseAdmin`, a
service-role client, explicitly commented "bypasses RLS," and all 13
non-webhook/webhook functions use it. Authorization today is `requireUser(req)`
(JWT → `user.id`) followed by hand-written `.eq('user_id', user.id)` /
`.eq('owner_user_id', owner.id)` filters in each function — there is no
RLS safety net in this path at all; the filter *is* the authorization.

So "scope by workspace, never by raw user" here means: **the same
`.eq('user_id', …)` filters must become `.eq('workspace_id', …)` filters**,
resolved through a new helper living alongside `requireUser` in
`_shared/` — call it `requireWorkspace(req, { role })` — that resolves
`user_id → workspace_id` via `workspace_members` (default: the caller's
personal/family workspace, i.e. today's behavior) once, at the top of the
function, the same way `requireUser` resolves the JWT once today.

**Also deferred to a later prompt**, for the same reason as §5.1: no edge
function is touched in this prompt. The two functions most directly
relevant when this does happen are `send-family-invite`/
`accept-family-invite` — they already cross a two-user boundary in one
call (owner ↔ invitee) and are the closest existing analog to "acting
within a shared workspace." `delete-account`'s cascade-delete
(`auth.admin.deleteUser` → `ON DELETE CASCADE` from `auth.users`) and the
billing functions' strict 1:1 `user_id ↔ stripe_customer_id`/`app_user_id`
resolution are flagged as the **riskiest** to adapt once a workspace can
have more than one member with a stake in its content — deleting one
member's `auth.users` row must never cascade-delete a shared workspace's
guides. This migration doesn't create that risk yet (every workspace has
exactly one member), but it's recorded here so Prompt 3/9 don't
rediscover it from scratch.

### 5.3 The compatibility layer, precisely

"Compatibility layer" is not a shim or a feature flag in this prompt —
it's the bijection in §3.1 plus the deferral choices in §5.1/§5.2. Old
code paths (RLS policies keyed on `user_id`, edge functions filtering on
`user_id`) keep running unmodified, and remain *correct*, because every
workspace created by this backfill has exactly one member who is exactly
that row's existing owner. The new tables and columns are present and
correctly populated, ready for Prompt 3 to point new, capability-based
authorization at — but until something is written to read `workspace_id`,
nothing changes. That's what makes this an additive migration rather than
a cutover.

## 6. Out of scope for this prompt (explicit, to prevent scope creep in review)

- **No client code changes.** `DataContext.jsx`'s `ownerIds` computation
  (`family_invitations` → list of user ids →
  `.in('user_id', ownerIds)`, `DataContext.jsx:93-105`) is untouched. It
  becomes a candidate to simplify into a single `.eq('workspace_id', …)`
  query once §5.1's policies exist — noted, not built.
- **No RLS policy rewrites** on existing content tables (§5.1).
- **No edge function changes** (§5.2).
- **No billing/organization linkage.** `user_billing` stays keyed by
  `user_id`; `organizations` does not gain a billing relationship. Prompt
  17 owns "org-level billing (an org with many workspaces pays once)."
- **No workspace switcher, no UI surfacing workspaces at all.** Prompt 2.
- **No role/capability matrix beyond the 3 values needed to losslessly
  represent today's `family_invitations.role`.** Prompt 3.
- **No `host` workspace has ever been created by this migration** — the
  `CHECK` constraint allows the value, nothing produces a row with it yet.
  Prompt 8 (Host app shell) is the first thing that will.
- **`family_members` cleanup** — flagged in §3.3, not actioned.

## 7. B2C stays byte-identical — the explicit argument

Three independent guarantees, each checkable:

1. **No existing row changes shape in an observable way.** Every schema
   change in this migration is `ADD COLUMN ... NULL` (new, nullable
   columns) or a wholly new table. No column is renamed, retyped, dropped,
   or has its default/nullability changed. `supabase/schema.sql`'s
   existing 26 tables keep every existing column exactly as-is.
2. **No query any client or edge function issues today changes.** §5's
   entire point is that this migration ships data, not new read/write
   paths. `grep` for `workspace_id` in `src/` or `supabase/functions/`
   after this migration lands should return zero results — if it doesn't,
   something in this prompt's scope was violated.
3. **No RLS policy's evaluated result changes for any existing row**,
   by the §3.1 bijection: every predicate that mattered before
   (`auth.uid() = user_id`, `is_accepted_family_member(...)`,
   `viewer_can_see_guide(...)`) evaluates over exactly the same rows,
   using exactly the same columns, exactly as before — `workspace_id`
   being newly present and correctly populated on those same rows doesn't
   change what any *existing* policy returns, because no existing policy
   references it.

Net: this migration is invisible from the app's perspective. It could
ship to production the same week it's reviewed, with the regression
surface of "did the additive `ALTER TABLE`s and new tables apply cleanly"
— not "did any user-facing behavior change," because none does.

## 8. Migration plan

Numbered to follow the existing `YYYYMMDD` convention (`supabase/migrations/`,
latest today: `20240117_reengagement.sql`). Each is additive and
independently reviewable; none requires a maintenance window.

| # | File | Contents | Depends on |
|---|---|---|---|
| 1 | `20240118_organizations_workspaces.sql` | `CREATE TABLE organizations`, `workspaces`, `workspace_members` (§2); their RLS policies (§4); `is_workspace_member()` helper (defined now, unused until Prompt 3 wires it into content policies) | none |
| 2 | `20240119_workspace_backfill_personal.sql` | Backfill: 1 org + 1 `family` workspace + 1 owner membership per existing `auth.users` row (§3.2); update `handle_new_user()` to do the same for new signups going forward | #1 |
| 3 | `20240120_workspace_membership_sync.sql` | `AFTER UPDATE OF status ON family_invitations` trigger projecting accepted/declined/removed into `workspace_members` (§3.3); one-time backfill of currently-accepted invitations | #1, #2 |
| 4 | `20240121_content_workspace_id.sql` | Additive nullable `workspace_id` on `guides`, `packs`, `shared_links`, `share_grants` (§3.4); backfill from each row's owner's personal workspace; indexes on the new column (`(workspace_id)` on each table, matching the existing `(user_id)` index pattern) | #2 |
| — | *(future, not this prompt)* | Verify 100% backfill + zero non-workspace-scoped writes in flight, then `ALTER COLUMN workspace_id SET NOT NULL` on all four tables — same deferred-cleanup pattern as `20240104_retire_archive.sql` | #4, verified in production |

Rollback for any of #1–#4 is a plain `DROP TABLE`/`DROP COLUMN` — nothing
downstream reads the new state yet, so rollback carries no data-loss risk
beyond the backfilled rows themselves.

## 9. Open questions for later prompts (recorded, not resolved here)

- Should `workspace_members` eventually absorb `family_invitations`
  entirely (one invite/membership model for both verticals), or do
  `family_invitations` (durable, relationship-based) and a future
  guest-link concept (host, anonymous, link-scoped — see `GLOSSARY.md`'s
  Helper-vs-Guest distinction) stay permanently distinct, with only the
  former ever projecting into `workspace_members`? Not decided here —
  this is squarely Prompt 3's (RBAC unification) call to make explicitly.
- `ai_generations`/`user_usage` are per-user today (§3.4); host pricing
  (Prompt 17) will need to decide whether AI/entitlement quotas pool per
  workspace or stay per-user-within-a-workspace. Not decided here.
- `family_members` cleanup (§3.3).
